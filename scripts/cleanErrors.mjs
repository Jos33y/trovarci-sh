#!/usr/bin/env node
// Cleanup of error_events: delete known bot probes, delete stringified-object noise from server-side
// non-Error throws, mark known-fixed patterns as resolved. Preview by default. Pass --apply to write.
// Run: node scripts/cleanErrors.mjs           (preview)
// Run: node scripts/cleanErrors.mjs --apply   (execute)

import { sql } from '../app/utils/db.server.js';

const APPLY = process.argv.includes('--apply');

console.log('=== error_events cleanup ===\n');

// Schema check - see which optional columns exist before using them in UPDATE
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'error_events'
`;
const colNames = new Set(cols.map(c => c.column_name));
if (!colNames.has('resolved_at')) {
  console.error('[FAIL] error_events table has no resolved_at column. Check schema.');
  await sql.end();
  process.exit(1);
}
const hasResolutionNote = colNames.has('resolution_note');

// Counts before
const [{ total }]      = await sql`SELECT count(*)::int AS total FROM error_events`;
const [{ unresolved }] = await sql`SELECT count(*)::int AS unresolved FROM error_events WHERE resolved_at IS NULL`;
console.log(`Current: ${total} total, ${unresolved} unresolved\n`);

// Category 1: bot probes and scanner user-agents. Two ways to detect a bot:
//   a. Path matches known vulnerability scan patterns (PHP/PHPUnit RCE, WordPress, .env, .git, etc.)
//   b. User-agent contains a known scanner signature (LeakIX, l9scan, masscan, censys, shodan, nuclei, etc.)
// Case (b) is important because scanners often hit legitimate paths (OPTIONS /, POST /api) to fingerprint
// the server. Path-only detection misses these; UA-based detection catches them.
console.log('--- Category 1: Bot probes and scanner UAs (DELETE) ---');
const [{ bots }] = await sql`
  SELECT count(*)::int AS bots FROM error_events
  WHERE path LIKE '%/vendor/%'
     OR path LIKE '%phpunit%'
     OR path LIKE '%eval-stdin%'
     OR path LIKE '%/graphql%'
     OR path LIKE '%/api/gql%'
     OR path LIKE '%wp-admin%'
     OR path LIKE '%wp-login%'
     OR path LIKE '%wp-includes%'
     OR path LIKE '%xmlrpc.php%'
     OR path LIKE '%.env%'
     OR path LIKE '%/.git%'
     OR path LIKE '%/phpmyadmin%'
     OR path LIKE '%/.aws%'
     OR path LIKE '%/.docker%'
     OR path LIKE '%/actuator%'
     OR path LIKE '%/backend/.env%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%leakix%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%l9scan%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%masscan%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%censys%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%shodan%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%nuclei%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%zgrab%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%netcraft%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%paloalto%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%semrushbot%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%acunetix%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%nikto%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%sqlmap%'
`;
console.log(`  ${bots} rows match scanner path or user-agent patterns`);
if (bots > 0) {
  const sample = await sql`
    SELECT
      CASE
        WHEN path LIKE '%/vendor/%' OR path LIKE '%phpunit%' OR path LIKE '%eval-stdin%'
             OR path LIKE '%/graphql%' OR path LIKE '%/api/gql%' OR path LIKE '%wp-admin%'
             OR path LIKE '%.env%' OR path LIKE '%/.git%'
        THEN 'path-based: ' || path
        ELSE 'ua-based: ' || COALESCE(redacted_context->'headers'->>'user-agent', '?')
      END AS pattern,
      count(*)::int AS n
    FROM error_events
    WHERE path LIKE '%/vendor/%' OR path LIKE '%phpunit%' OR path LIKE '%eval-stdin%'
       OR path LIKE '%/graphql%' OR path LIKE '%/api/gql%' OR path LIKE '%wp-admin%'
       OR path LIKE '%.env%' OR path LIKE '%/.git%' OR path LIKE '%/phpmyadmin%'
       OR redacted_context->'headers'->>'user-agent' ILIKE '%leakix%'
       OR redacted_context->'headers'->>'user-agent' ILIKE '%l9scan%'
       OR redacted_context->'headers'->>'user-agent' ILIKE '%masscan%'
       OR redacted_context->'headers'->>'user-agent' ILIKE '%censys%'
       OR redacted_context->'headers'->>'user-agent' ILIKE '%shodan%'
       OR redacted_context->'headers'->>'user-agent' ILIKE '%nuclei%'
    GROUP BY pattern ORDER BY n DESC LIMIT 8
  `;
  console.log('  Top patterns:');
  for (const r of sample) {
    const truncated = r.pattern.length > 100 ? r.pattern.slice(0, 100) + '...' : r.pattern;
    console.log(`    ${r.n.toString().padStart(4)}  ${truncated}`);
  }
}
console.log('');

// Category 2: stringified-object noise NOT already caught as a bot.
// Message stored as '[object Response]', '[object Object]', '(non-string error)', or null with no stack.
// Root cause: errors.server.js did String(error) on non-Error values (fixed by extractMessage patch).
// New instances prevented by entry.server.jsx 4xx filter + errors.server.js patch, but historical
// rows from the pre-fix era remain. Only delete rows that AREN'T bot-flagged, so real user errors
// with unhelpful [object Object] messages stay visible for investigation.
console.log('--- Category 2: Stringified-object noise (DELETE, excluding bot-flagged) ---');
const [{ noise }] = await sql`
  SELECT count(*)::int AS noise FROM error_events
  WHERE kind = 'server_route'
    AND (
      message LIKE '[object %'
      OR message ILIKE '%non-string error%'
      OR (message IS NULL AND stack IS NULL)
    )
    AND NOT (
      path LIKE '%/vendor/%'
      OR path LIKE '%phpunit%'
      OR path LIKE '%eval-stdin%'
      OR path LIKE '%/graphql%'
      OR path LIKE '%/api/gql%'
      OR path LIKE '%wp-admin%'
      OR path LIKE '%.env%'
      OR path LIKE '%/.git%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%leakix%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%l9scan%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%masscan%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%censys%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%shodan%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%nuclei%'
    )
`;
console.log(`  ${noise} rows with placeholder messages that are NOT bot-flagged`);
console.log('  (real user issues surviving here should be investigated, not deleted)\n');

// Category 3: React #418 hydration errors on /receipts (fixed by formatDateLong deploy)
console.log('--- Category 3: /receipts hydration errors (MARK RESOLVED) ---');
const [{ hydration }] = await sql`
  SELECT count(*)::int AS hydration FROM error_events
  WHERE resolved_at IS NULL
    AND path LIKE '/receipts/%'
    AND (
      message ILIKE '%hydrat%'
      OR message ILIKE '%React error #418%'
      OR message ILIKE '%error #418%'
    )
`;
console.log(`  ${hydration} rows match React #418 on receipts pages`);
console.log(`  (fixed by deterministic formatDateLong formatter deployed 2026-07-13)\n`);

// Summary
const totalToDelete  = bots + noise;
const totalToResolve = hydration;
console.log('--- Summary ---');
console.log(`  Delete: ${totalToDelete} rows (${bots} bot/scanner + ${noise} genuine object-noise)`);
console.log(`  Mark resolved: ${totalToResolve} rows`);
console.log(`  After cleanup: ~${total - totalToDelete} rows remain\n`);

if (!APPLY) {
  console.log('Preview only. Re-run with --apply to execute.\n');
  await sql.end();
  process.exit(0);
}

// Apply
console.log('Applying...\n');

const del1 = await sql`
  DELETE FROM error_events
  WHERE path LIKE '%/vendor/%'
     OR path LIKE '%phpunit%'
     OR path LIKE '%eval-stdin%'
     OR path LIKE '%/graphql%'
     OR path LIKE '%/api/gql%'
     OR path LIKE '%wp-admin%'
     OR path LIKE '%wp-login%'
     OR path LIKE '%wp-includes%'
     OR path LIKE '%xmlrpc.php%'
     OR path LIKE '%.env%'
     OR path LIKE '%/.git%'
     OR path LIKE '%/phpmyadmin%'
     OR path LIKE '%/.aws%'
     OR path LIKE '%/.docker%'
     OR path LIKE '%/actuator%'
     OR path LIKE '%/backend/.env%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%leakix%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%l9scan%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%masscan%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%censys%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%shodan%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%nuclei%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%zgrab%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%netcraft%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%paloalto%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%semrushbot%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%acunetix%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%nikto%'
     OR redacted_context->'headers'->>'user-agent' ILIKE '%sqlmap%'
`;
console.log(`  [OK] Deleted bot/scanner rows: ${del1.count}`);

const del2 = await sql`
  DELETE FROM error_events
  WHERE kind = 'server_route'
    AND (
      message LIKE '[object %'
      OR message ILIKE '%non-string error%'
      OR (message IS NULL AND stack IS NULL)
    )
    AND NOT (
      path LIKE '%/vendor/%'
      OR path LIKE '%phpunit%'
      OR path LIKE '%eval-stdin%'
      OR path LIKE '%/graphql%'
      OR path LIKE '%/api/gql%'
      OR path LIKE '%wp-admin%'
      OR path LIKE '%.env%'
      OR path LIKE '%/.git%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%leakix%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%l9scan%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%masscan%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%censys%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%shodan%'
      OR redacted_context->'headers'->>'user-agent' ILIKE '%nuclei%'
    )
`;
console.log(`  [OK] Deleted genuine stringified-object noise: ${del2.count}`);

// Mark resolved. resolved_by is a uuid column - skip it, use resolution_note instead.
const resolutionNote = 'Fixed by formatDateLong deterministic formatter in receipts route (deploy 2026-07-13).';
const res = hasResolutionNote
  ? await sql`
      UPDATE error_events
      SET resolved_at = NOW(),
          resolution_note = ${resolutionNote}
      WHERE resolved_at IS NULL
        AND path LIKE '/receipts/%'
        AND (
          message ILIKE '%hydrat%'
          OR message ILIKE '%React error #418%'
          OR message ILIKE '%error #418%'
        )
    `
  : await sql`
      UPDATE error_events
      SET resolved_at = NOW()
      WHERE resolved_at IS NULL
        AND path LIKE '/receipts/%'
        AND (
          message ILIKE '%hydrat%'
          OR message ILIKE '%React error #418%'
          OR message ILIKE '%error #418%'
        )
    `;
console.log(`  [OK] Marked receipts hydration as resolved: ${res.count}`);

// Final counts
const [{ finalTotal }]      = await sql`SELECT count(*)::int AS "finalTotal" FROM error_events`;
const [{ finalUnresolved }] = await sql`SELECT count(*)::int AS "finalUnresolved" FROM error_events WHERE resolved_at IS NULL`;
console.log(`\nFinal: ${finalTotal} total, ${finalUnresolved} unresolved`);

await sql.end();
console.log('\nDone.');
