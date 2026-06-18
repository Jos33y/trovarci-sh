#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────────
   verifyBatch10_live.mjs

   Live-data confirmation for Batch F1. Run AFTER you've visited a few
   pages in the browser so there's something to read.

   Reads the same DB the app uses (via DATABASE_URL from .env). No psql
   needed.

   Run:
     node --env-file=.env scripts/verifyBatch10_live.mjs
   ─────────────────────────────────────────────────────────────────────── */

import { sql } from '../app/utils/db.server.js';

console.log('=== F1 live-data check ===\n');

// 1. Recent analytics events (any source).
const recent = await sql`
  SELECT event_type, path, country, device_class, is_bot,
         user_id IS NOT NULL AS authed,
         to_char(created_at, 'HH24:MI:SS') AS ts
  FROM analytics_events
  ORDER BY id DESC
  LIMIT 15
`;
console.log(`Last ${recent.length} analytics_events:`);
if (recent.length === 0) {
  console.log('  (empty - hit a few pages in the browser first)\n');
} else {
  for (const r of recent) {
    console.log(`  ${r.ts}  ${r.event_type.padEnd(22)} ${(r.path || '-').padEnd(20)} ${r.country} ${r.device_class.padEnd(8)} authed=${r.authed}`);
  }
  console.log('');
}

// 2. Event-type histogram.
const histo = await sql`
  SELECT event_type, count(*)::int AS n
  FROM analytics_events
  WHERE created_at > now() - interval '1 hour'
  GROUP BY event_type
  ORDER BY n DESC
`;
console.log(`Event types (last hour, ${histo.length} distinct):`);
for (const r of histo) console.log(`  ${String(r.n).padStart(4)}  ${r.event_type}`);
console.log('');

// 3. Top paths.
const paths = await sql`
  SELECT path, count(*)::int AS n
  FROM analytics_events
  WHERE event_type IN ('pageview', 'pageview_ssr')
    AND path IS NOT NULL
    AND created_at > now() - interval '1 hour'
  GROUP BY path
  ORDER BY n DESC
  LIMIT 10
`;
console.log(`Top paths (pageview*, last hour):`);
for (const r of paths) console.log(`  ${String(r.n).padStart(4)}  ${r.path}`);
console.log('');

// 4. Daily rollup state.
const today = new Date().toISOString().slice(0, 10);
const rollup = await sql`
  SELECT dimension, count(*)::int AS rows, sum(event_count)::int AS total
  FROM analytics_daily
  WHERE day = ${today}::date
  GROUP BY dimension
  ORDER BY dimension
`;
console.log(`analytics_daily for ${today}:`);
if (rollup.length === 0) {
  console.log('  (no rows yet - rollup runs hourly; first run after worker uptime > a few seconds)');
} else {
  for (const r of rollup) console.log(`  ${r.dimension.padEnd(20)} rows=${r.rows} events=${r.total}`);
}
console.log('');

// 5. Errors.
const errs = await sql`
  SELECT kind, severity, count(*)::int AS n,
         max(to_char(created_at, 'HH24:MI:SS')) AS last_seen
  FROM error_events
  WHERE created_at > now() - interval '1 hour'
  GROUP BY kind, severity
  ORDER BY n DESC
`;
console.log(`error_events (last hour):`);
if (errs.length === 0) console.log('  (none - good)');
else for (const r of errs) console.log(`  ${r.kind.padEnd(14)} ${r.severity.padEnd(8)} n=${r.n}  last=${r.last_seen}`);
console.log('');

// 6. Funnel snapshot.
const funnel = await sql`
  SELECT event_type, count(distinct session_hash)::int AS sessions
  FROM analytics_events
  WHERE event_type IN (
    'pageview_ssr','pageview',
    'auth_submit','auth_otp_sent','auth_signup_complete','auth_success',
    'credits_view','checkout_click','payment_pending','payment_confirmed','payment_failed','payment_abandoned'
  )
  AND created_at > now() - interval '24 hours'
  GROUP BY event_type
  ORDER BY sessions DESC
`;
console.log(`Funnel (last 24h, distinct sessions per step):`);
if (funnel.length === 0) console.log('  (no funnel events yet)');
else for (const r of funnel) console.log(`  ${String(r.sessions).padStart(4)}  ${r.event_type}`);

await sql.end();
console.log('\nDone.');
