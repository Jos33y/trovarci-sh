#!/usr/bin/env node
// Cleanup of analytics noise: deprecated event types, framework probe paths, admin routes.
// Also re-rolls today's daily rollup so cleaned numbers reflect. Idempotent - safe to re-run.
// Run: node --env-file=.env scripts/cleanAnalyticsNoise.mjs

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

// Admin routes and login redirects targeting admin. position() is used for the login case because
// LIKE would interpret %2F as a wildcard, so we scan for the literal URL-encoded substring instead.
const r3 = await sql`
  DELETE FROM analytics_events
  WHERE path = '/admin'
     OR path LIKE '/admin/%'
     OR path LIKE '/admin?%'
     OR (
       path LIKE '/login?%'
       AND (
         position('redirectTo=%2Fadmin' in path) > 0
         OR position('redirectTo=/admin' in path) > 0
       )
     )
`;
console.log(`  removed admin paths:  ${r3.count}`);

const after = (await sql`SELECT count(*)::int AS n FROM analytics_events`)[0].n;
console.log(`analytics_events after:  ${after}`);
console.log('');

const today = new Date().toISOString().slice(0, 10);
const rd = await sql`DELETE FROM analytics_daily WHERE day = ${today}::date`;
console.log(`Cleared today's rollup: ${rd.count} rows`);

const written = await computeDailyRollup(today);
console.log(`Recomputed today's rollup: ${written} rows written`);

await sql.end();
console.log('\nDone.');
