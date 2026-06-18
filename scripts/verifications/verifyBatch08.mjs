#!/usr/bin/env node
/**
 * verifyBatch08.mjs - P1-17 cleanup loop smoke test
 *
 * Runs each cleanup helper against the live DB and prints rows deleted.
 * Idempotent: a second run deletes nothing. Counts may be 0 on a fresh
 * DB; that's a pass.
 *
 * Usage:
 *   node --env-file=.env scripts/verifyBatch08.mjs
 */

import {
  cleanupExpiredSessions,
  cleanupExpiredEmailVerificationCodes,
  runAuthCleanups,
} from '../app/utils/authCleanup.server.js';
import { cleanupOldRateLimitRows } from '../app/utils/rateLimit.server.js';
import { sql } from '../app/utils/db.server.js';

function row(label, val) {
  const padLabel = label.padEnd(36);
  console.log(`  ${padLabel} ${val}`);
}

async function main() {
  console.log('\n=== P1-17 cleanup loop smoke test ===\n');

  // Pre-state: row counts in each target table
  const [{ count: rl0 }] = await sql`SELECT COUNT(*)::int AS count FROM auth_rate_limits`;
  const [{ count: ses0 }] = await sql`SELECT COUNT(*)::int AS count FROM sessions`;
  const [{ count: evc0 }] = await sql`SELECT COUNT(*)::int AS count FROM email_verification_codes`;
  console.log('Before:');
  row('auth_rate_limits rows',           rl0);
  row('sessions rows',                   ses0);
  row('email_verification_codes rows',   evc0);
  console.log('');

  // 1. Individual helpers
  const rl1 = await cleanupOldRateLimitRows({ keepHours: 24 });
  const ses1 = await cleanupExpiredSessions({ graceHours: 24 });
  const evc1 = await cleanupExpiredEmailVerificationCodes({ graceHours: 1 });
  console.log('Individual sweeps:');
  row('cleanupOldRateLimitRows deleted',                  rl1 ?? 0);
  row('cleanupExpiredSessions deleted',                   ses1);
  row('cleanupExpiredEmailVerificationCodes deleted',     evc1);
  console.log('');

  // 2. Idempotency: second call should delete zero
  const r2 = await runAuthCleanups();
  console.log('Second sweep (orchestrator, expect zeros):');
  row('rateLimits',  r2.rateLimits);
  row('sessions',    r2.sessions);
  row('evcs',        r2.evcs);
  row('durationMs',  r2.durationMs);
  row('errors',      r2.errors.length);
  console.log('');

  const allZero = r2.rateLimits === 0 && r2.sessions === 0 && r2.evcs === 0;
  const noErrors = r2.errors.length === 0;

  if (!allZero) {
    console.error('FAIL: orchestrator second run was not a no-op');
    process.exit(1);
  }
  if (!noErrors) {
    console.error('FAIL: orchestrator reported errors:', r2.errors);
    process.exit(1);
  }

  // Post-state
  const [{ count: rl2 }] = await sql`SELECT COUNT(*)::int AS count FROM auth_rate_limits`;
  const [{ count: ses2 }] = await sql`SELECT COUNT(*)::int AS count FROM sessions`;
  const [{ count: evc2 }] = await sql`SELECT COUNT(*)::int AS count FROM email_verification_codes`;
  console.log('After:');
  row('auth_rate_limits rows',           rl2);
  row('sessions rows',                   ses2);
  row('email_verification_codes rows',   evc2);
  console.log('');

  console.log('PASS\n');
  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAIL:', err);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
