#!/usr/bin/env node
// Diagnostic: inspect error_events for triage. Read-only, no writes.
// Run: node scripts/inspectErrors.mjs

import { sql } from '../app/utils/db.server.js';

console.log('=== error_events inspection ===\n');

// Schema check first - fails fast if table name differs.
const cols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'error_events'
  ORDER BY ordinal_position
`;

if (cols.length === 0) {
  console.error('[FAIL] error_events table not found. Check the table name or run migrations.');
  await sql.end();
  process.exit(1);
}

console.log('--- Columns ---');
for (const c of cols) console.log(`  ${c.column_name.padEnd(20)}  ${c.data_type}`);
console.log('');

// Counts by resolved state.
const [{ total }]      = await sql`SELECT count(*)::int AS total FROM error_events`;
const [{ unresolved }] = await sql`SELECT count(*)::int AS unresolved FROM error_events WHERE resolved_at IS NULL`;
const [{ resolved }]   = await sql`SELECT count(*)::int AS resolved FROM error_events WHERE resolved_at IS NOT NULL`;
console.log(`Total: ${total}   Unresolved: ${unresolved}   Resolved: ${resolved}\n`);

// By kind.
console.log('--- By kind ---');
const byKind = await sql`
  SELECT kind, count(*)::int AS n
  FROM error_events
  GROUP BY kind
  ORDER BY n DESC
`;
for (const row of byKind) console.log(`  ${row.n.toString().padStart(6)}  ${row.kind}`);
console.log('');

// By severity.
console.log('--- By severity ---');
const bySev = await sql`
  SELECT severity, count(*)::int AS n
  FROM error_events
  GROUP BY severity
  ORDER BY n DESC
`;
for (const row of bySev) console.log(`  ${row.n.toString().padStart(6)}  ${row.severity}`);
console.log('');

// Top 30 paths - identifies bot probe patterns and hot spots.
console.log('--- Top 30 paths ---');
const topPaths = await sql`
  SELECT path, count(*)::int AS n
  FROM error_events
  GROUP BY path
  ORDER BY n DESC
  LIMIT 30
`;
for (const row of topPaths) console.log(`  ${row.n.toString().padStart(6)}  ${row.path || '(null)'}`);
console.log('');

// Bot probe pattern count. These are automated vulnerability scanners hitting non-existent paths.
console.log('--- Bot probe candidates ---');
const [{ botProbes }] = await sql`
  SELECT count(*)::int AS "botProbes"
  FROM error_events
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
`;
console.log(`  ${botProbes} rows match automated vulnerability scan patterns`);
console.log('  (PHP/PHPUnit RCE probes, GraphQL scans, WordPress paths, env leaks, git leaks)\n');

// Proxy / IPRoyal error detection.
console.log('--- Proxy / IPRoyal signatures ---');
const [{ proxyErrs }] = await sql`
  SELECT count(*)::int AS "proxyErrs"
  FROM error_events
  WHERE COALESCE(message, '') ILIKE '%proxy%'
     OR COALESCE(message, '') ILIKE '%iproyal%'
     OR COALESCE(message, '') ILIKE '%socks5%'
     OR COALESCE(message, '') ILIKE '%407%'
     OR COALESCE(message, '') ILIKE '%ECONNREFUSED%'
     OR COALESCE(message, '') ILIKE '%tunnel%'
     OR COALESCE(stack, '')   ILIKE '%proxyRotation%'
`;
console.log(`  ${proxyErrs} rows match proxy-related patterns`);
console.log('  (proxy, iproyal, socks5, 407, ECONNREFUSED, tunnel, proxyRotation stack frames)\n');

// Top signatures for unresolved non-bot errors - the real triage list.
console.log('--- Top 15 unresolved error signatures (non-bot) ---');
const signatures = await sql`
  SELECT
    LEFT(COALESCE(message, '(null)'), 120) AS msg,
    kind,
    count(*)::int AS n
  FROM error_events
  WHERE resolved_at IS NULL
    AND NOT (
      path LIKE '%/vendor/%'
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
    )
  GROUP BY LEFT(COALESCE(message, '(null)'), 120), kind
  ORDER BY n DESC
  LIMIT 15
`;
for (const row of signatures) {
  console.log(`  [${row.kind.padEnd(15)}]  (${row.n.toString().padStart(3)})  ${row.msg}`);
}
console.log('');

// Last 10 unresolved real errors with full detail.
console.log('--- Last 10 unresolved real errors (full detail) ---');
const recent = await sql`
  SELECT id, created_at, kind, severity, path, method, status_code, message, stack, redacted_context
  FROM error_events
  WHERE resolved_at IS NULL
    AND NOT (
      path LIKE '%/vendor/%'
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
    )
  ORDER BY created_at DESC
  LIMIT 10
`;
for (const row of recent) {
  const ts = row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at);
  console.log(`\n[${row.id}]`);
  console.log(`  when:     ${ts}`);
  console.log(`  kind:     ${row.kind}   severity: ${row.severity}`);
  if (row.method || row.status_code) console.log(`  request:  ${row.method || '?'} ${row.path || '?'}  status=${row.status_code || '?'}`);
  else                                console.log(`  path:     ${row.path || '(null)'}`);
  console.log(`  message:  ${(row.message || '(null)').slice(0, 300)}`);
  if (row.stack) {
    const lines = String(row.stack).split('\n').slice(0, 6);
    console.log('  stack (first 6 lines):');
    for (const l of lines) console.log(`    ${l}`);
  }
  if (row.redacted_context) {
    const ctxStr = typeof row.redacted_context === 'string' ? row.redacted_context : JSON.stringify(row.redacted_context);
    console.log(`  context:  ${ctxStr.slice(0, 300)}`);
  }
}
console.log('');

await sql.end();
console.log('Done.');
