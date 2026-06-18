#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────
   cleanAnalyticsNoise.mjs

   One-shot cleanup of analytics noise collected before hotfix-2:
     - pageview_ssr rows (deprecated event type)
     - /.well-known/* paths (Chrome devtools, ACME, etc)
     - /api/* paths (XHRs, never pageviews)
     - *.data paths (RR v7 client-nav data fetches)

   Also re-rolls today's daily rollup so the cleaned numbers reflect.

   Run once after hotfix-2:
     node --env-file=.env scripts/cleanAnalyticsNoise.mjs
   ─────────────────────────────────────────────────────────────────────── */

import { sql } from '../app/utils/db.server.js';
import { computeDailyRollup } from '../app/utils/analytics.server.js';

console.log('=== Analytics noise cleanup ===\n');

const before = (await sql`SELECT count(*)::int AS n FROM analytics_events`)[0].n;
console.log(`analytics_events before: ${before}`);

const r1 = await sql`
  DELETE FROM analytics_events
  WHERE event_type = 'pageview_ssr'
`;
console.log(`  removed pageview_ssr: ${r1.count}`);

const r2 = await sql`
  DELETE FROM analytics_events
  WHERE path LIKE '/.well-known/%'
     OR path LIKE '/api/%'
     OR path LIKE '%.data'
`;
console.log(`  removed junk paths:   ${r2.count}`);

const after = (await sql`SELECT count(*)::int AS n FROM analytics_events`)[0].n;
console.log(`analytics_events after:  ${after}`);
console.log('');

// Wipe today's rollup so it recomputes cleanly.
const today = new Date().toISOString().slice(0, 10);
const rd = await sql`DELETE FROM analytics_daily WHERE day = ${today}::date`;
console.log(`Cleared today's rollup: ${rd.count} rows`);

const written = await computeDailyRollup(today);
console.log(`Recomputed today's rollup: ${written} rows written`);

await sql.end();
console.log('\nDone.');
