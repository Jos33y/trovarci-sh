#!/usr/bin/env node
// Cleanup of error_events: delete known bot probes, delete stringified-object noise,
// mark known-fixed patterns as resolved. Preview by default. Pass --apply to write.
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

// Category 1: bot probes - always safe to delete (automated vulnerability scanners hitting non-existent paths)
console.log('--- Category 1: Bot probes (DELETE) ---');
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
`;
console.log(`  ${bots} rows match automated vulnerability scan patterns`);
if (bots > 0) {
  const sample = await sql`
    SELECT path, count(*)::int AS n FROM error_events
    WHERE path LIKE '%/vendor/%' OR path LIKE '%phpunit%' OR path LIKE '%eval-stdin%'
       OR path LIKE '%/graphql%' OR path LIKE '%/api/gql%' OR path LIKE '%wp-admin%'
       OR path LIKE '%.env%' OR path LIKE '%/.git%' OR path LIKE '%/phpmyadmin%'
    GROUP BY path ORDER BY n DESC LIMIT 5
  `;
  console.log('  Top 5 patterns:');
  for (const r of sample) console.log(`    ${r.n.toString().padStart(4)}  ${r.path}`);
}
console.log('');

// Category 2: stringified-object noise. Message stored as '[object Response]', '[object Object]',
// '(non-string error)', or null with no stack. Root cause: errors.server.js does String(error) on
// non-Error values, which produces '[object X]' for plain objects and Response instances.
// New instances are prevented by entry.server.jsx patch, but historical rows are pure noise.
console.log('--- Category 2: Stringified-object noise (DELETE) ---');
const [{ noise }] = await sql`
  SELECT count(*)::int AS noise FROM error_events
  WHERE kind = 'server_route'
    AND (
      message LIKE '[object %'
      OR message ILIKE '%non-string error%'
      OR (message IS NULL AND stack IS NULL)
    )
`;
console.log(`  ${noise} rows with [object X] placeholder messages or empty message+stack`);
if (noise > 0) {
  const sample = await sql`
    SELECT COALESCE(message, '(null)') AS message, count(*)::int AS n FROM error_events
    WHERE kind = 'server_route'
      AND (message LIKE '[object %' OR message ILIKE '%non-string error%' OR (message IS NULL AND stack IS NULL))
    GROUP BY COALESCE(message, '(null)') ORDER BY n DESC LIMIT 5
  `;
  console.log('  Top 5 patterns:');
  for (const r of sample) console.log(`    ${r.n.toString().padStart(4)}  ${r.message}`);
}
console.log('');

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
console.log(`  Delete: ${totalToDelete} rows (${bots} bot + ${noise} object-noise)`);
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
`;
console.log(`  [OK] Deleted bot probes: ${del1.count}`);

const del2 = await sql`
  DELETE FROM error_events
  WHERE kind = 'server_route'
    AND (
      message LIKE '[object %'
      OR message ILIKE '%non-string error%'
      OR (message IS NULL AND stack IS NULL)
    )
`;
console.log(`  [OK] Deleted stringified-object noise: ${del2.count}`);

// Mark resolved. resolved_by is a uuid column (needs a real user id), so we skip it and use
// resolution_note (text) to attribute the resolution to the deploy that fixed the bug.
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
