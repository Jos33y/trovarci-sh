#!/usr/bin/env node
// Repairs stored pageviews: referrer and UTM backfill from saved page data, query-free paths, duplicate removal.
// Dry run by default. Apply with: node --env-file=.env scripts/repairAnalytics.mjs --apply

import { sql } from '../app/utils/db.server.js';
import { computeDailyRollup } from '../app/utils/analytics.server.js';

const APPLY = process.argv.includes('--apply');
const OWN_HOSTS = ['trovarci.sh', 'www.trovarci.sh', 'localhost'];

// Duplicates: same session, same page, within 2 seconds. The old client sent a second pageview on hydration.
const DUP_WINDOW = '2 seconds';

// Fragment builder, so the same expression works inside the transaction handle too.
const host = (db) => db`lower(substring(metadata->>'client_referrer' from '^[a-zA-Z]+://([^/:?#]+)'))`;

async function counts(db) {
  const [r] = await db`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'pageview')::int AS pageviews,
      COUNT(*) FILTER (
        WHERE event_type = 'pageview'
          AND referrer_domain IS NULL
          AND metadata->>'client_referrer' IS NOT NULL
          AND ${host(db)} IS NOT NULL
          AND ${host(db)} <> ALL(${OWN_HOSTS})
      )::int AS referrer_backfill,
      COUNT(*) FILTER (
        WHERE event_type = 'pageview' AND utm_source IS NULL AND path ~ '[?&]utm_source='
      )::int AS utm_backfill,
      COUNT(*) FILTER (WHERE event_type = 'pageview' AND path LIKE '%?%')::int AS paths_with_query
    FROM analytics_events
  `;
  const [d] = await db`
    SELECT COUNT(*)::int AS duplicates
    FROM analytics_events a
    WHERE a.event_type = 'pageview'
      AND EXISTS (
        SELECT 1 FROM analytics_events b
        WHERE b.event_type = 'pageview'
          AND b.session_hash = a.session_hash
          AND split_part(b.path, '?', 1) = split_part(a.path, '?', 1)
          AND b.id < a.id
          AND a.created_at - b.created_at BETWEEN interval '0' AND ${DUP_WINDOW}::interval
      )
  `;
  return { ...r, ...d };
}

async function repair(db) {
  const referrers = await db`
    UPDATE analytics_events
    SET referrer_domain = regexp_replace(${host(db)}, '^www[.]', '')
    WHERE event_type = 'pageview'
      AND referrer_domain IS NULL
      AND metadata->>'client_referrer' IS NOT NULL
      AND ${host(db)} IS NOT NULL
      AND ${host(db)} <> ALL(${OWN_HOSTS})
  `;

  const utm = await db`
    UPDATE analytics_events
    SET
      utm_source   = left(substring(path from '[?&]utm_source=([^&#]+)'), 128),
      utm_medium   = COALESCE(utm_medium,   left(substring(path from '[?&]utm_medium=([^&#]+)'), 128)),
      utm_campaign = COALESCE(utm_campaign, left(substring(path from '[?&]utm_campaign=([^&#]+)'), 128))
    WHERE event_type = 'pageview'
      AND utm_source IS NULL
      AND path ~ '[?&]utm_source='
  `;

  // Delete duplicates before stripping queries, so both copies still compare on the same rule.
  const dups = await db`
    DELETE FROM analytics_events a
    WHERE a.event_type = 'pageview'
      AND EXISTS (
        SELECT 1 FROM analytics_events b
        WHERE b.event_type = 'pageview'
          AND b.session_hash = a.session_hash
          AND split_part(b.path, '?', 1) = split_part(a.path, '?', 1)
          AND b.id < a.id
          AND a.created_at - b.created_at BETWEEN interval '0' AND ${DUP_WINDOW}::interval
      )
  `;

  const paths = await db`
    UPDATE analytics_events
    SET path = split_part(path, '?', 1)
    WHERE event_type = 'pageview' AND path LIKE '%?%'
  `;

  return { referrers: referrers.count, utm: utm.count, duplicates: dups.count, paths: paths.count };
}

try {
  console.log(APPLY ? '=== Analytics repair (APPLY) ===\n' : '=== Analytics repair (dry run) ===\n');

  const before = await counts(sql);
  console.log(`pageviews stored:            ${before.pageviews}`);
  console.log(`referrer to backfill:        ${before.referrer_backfill}`);
  console.log(`utm_source to backfill:      ${before.utm_backfill}`);
  console.log(`duplicate pageviews:         ${before.duplicates}`);
  console.log(`paths carrying a query:      ${before.paths_with_query}`);

  const db = sql;
  const sample = await db`
    SELECT regexp_replace(${host(db)}, '^www[.]', '') AS domain, COUNT(*)::int AS n
    FROM analytics_events
    WHERE event_type = 'pageview'
      AND referrer_domain IS NULL
      AND metadata->>'client_referrer' IS NOT NULL
      AND ${host(db)} IS NOT NULL
      AND ${host(db)} <> ALL(${OWN_HOSTS})
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 15
  `;
  if (sample.length) {
    console.log('\nreferrers that will be filled in:');
    for (const s of sample) console.log(`  ${String(s.n).padStart(6)}  ${s.domain}`);
  }

  if (!APPLY) {
    console.log('\nDry run only. Nothing changed. Re-run with --apply to write.');
  } else {
    const result = await sql.begin((tx) => repair(tx));
    console.log('\napplied:');
    console.log(`  referrer_domain filled:  ${result.referrers}`);
    console.log(`  utm fields filled:       ${result.utm}`);
    console.log(`  duplicates removed:      ${result.duplicates}`);
    console.log(`  paths stripped of query: ${result.paths}`);

    const days = await sql`
      SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
      FROM analytics_events
      ORDER BY 1
    `;
    for (const { day } of days) await computeDailyRollup(day);
    console.log(`  daily rollups recomputed: ${days.length} days`);

    const after = await counts(sql);
    console.log(`\npageviews stored now:        ${after.pageviews}`);
    console.log(`duplicates left:             ${after.duplicates}`);
  }
} catch (err) {
  console.error('\nrepair failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
