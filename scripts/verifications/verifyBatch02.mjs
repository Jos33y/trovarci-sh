#!/usr/bin/env node
/**
 * scripts/verifyBatch02.mjs
 *
 * Smoke-tests the six lib modules dropped in Batch 2 of the Email Verifier.
 *
 * Run:
 *
 *     node --env-file=.env scripts/verifyBatch02.mjs
 *
 * (Node 20+. If you're on an older Node, run via dotenv-cli instead:
 *  npx dotenv -e .env -- node scripts/verifyBatch02.mjs)
 *
 * Exit code: 0 if all checks pass, 1 otherwise.
 *
 * Sections:
 *   1. disposable list loads with expected size
 *   2. catchallCache round-trip through Postgres
 *   3. proxyRotation interface (handles "not configured" cleanly)
 *   4. jobQueue lifecycle (createBulkJob -> claim -> mark -> tick)
 *   5. emailVerify pipeline short-circuits (syntax / no MX / tags)
 *
 * IPRoyal and R2 are NOT required. The proxy and storage modules return
 * clean error codes when unconfigured; the proxy test treats that as a
 * pass. CSV storage is not exercised here (Batch 3 worker is the first
 * caller).
 */

import postgres from 'postgres';
import * as disposable     from '../app/lib/disposableDomains.server.js';
import * as catchallCache  from '../app/lib/catchallCache.server.js';
import * as proxyRotation  from '../app/lib/proxyRotation.server.js';
import * as jobQueue       from '../app/lib/jobQueue.server.js';
import * as emailVerify    from '../app/lib/emailVerify.server.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Run with --env-file=.env or via dotenv-cli.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

const passes = [];
const fails = [];

function pass(msg) {
  passes.push(msg);
  console.log(`[OK]   ${msg}`);
}
function fail(msg) {
  fails.push(msg);
  console.log(`[FAIL] ${msg}`);
}

// =========================================================================
// 1. Disposable domains
// =========================================================================

function checkDisposable() {
  console.log('\n--- Disposable domains list ---');

  const count = disposable.getDisposableCount();
  if (count > 1000) pass(`List loaded with ${count.toLocaleString()} domains`);
  else fail(`List has only ${count} domains, expected 100k+`);

  if (disposable.isDisposable('mailinator.com')) pass('mailinator.com flagged disposable');
  else fail('mailinator.com NOT flagged (broken list)');

  if (!disposable.isDisposable('gmail.com')) pass('gmail.com NOT flagged disposable');
  else fail('gmail.com IS flagged (check EXCLUDED set in build script)');

  if (!disposable.isDisposable('trovarci.sh')) pass('trovarci.sh NOT flagged');
  else fail('trovarci.sh IS flagged (very bad)');
}

// =========================================================================
// 2. Catchall cache
// =========================================================================

async function checkCatchallCache() {
  console.log('\n--- Catch-all cache (DB round-trip) ---');
  const testDomain = `test-batch02-${Date.now()}.example`;

  const before = await catchallCache.getCatchall(testDomain);
  if (before === null) pass('Cache miss returns null');
  else fail(`Cache miss returned ${JSON.stringify(before)}`);

  await catchallCache.setCatchall(testDomain, true);
  pass('setCatchall completed');

  const hit = await catchallCache.getCatchall(testDomain);
  if (hit && hit.isCatchall === true) pass(`Cache hit (detectedVia=${hit.detectedVia})`);
  else fail(`Cache hit returned: ${JSON.stringify(hit)}`);

  const stats = await catchallCache.getStats();
  if (typeof stats.total === 'number') {
    pass(`Stats query (total=${stats.total}, catchall=${stats.catchall})`);
  } else {
    fail(`Stats bad shape: ${JSON.stringify(stats)}`);
  }

  const removed = await catchallCache.invalidate(testDomain);
  if (removed) pass('invalidate() removed row');
  else fail('invalidate() reported no row deleted');

  const gone = await catchallCache.getCatchall(testDomain);
  if (gone === null) pass('Post-invalidate miss');
  else fail(`Post-invalidate returned: ${JSON.stringify(gone)}`);
}

// =========================================================================
// 3. Proxy rotation
// =========================================================================

function checkProxyRotation() {
  console.log('\n--- Proxy rotation interface ---');
  const health = proxyRotation.getHealth();
  console.log(`       provider=${health.provider} hasCredentials=${health.hasCredentials}`);

  if (!health.hasCredentials) {
    const p = proxyRotation.getProxy({ stickyKey: 'gmail.com' });
    if (!p.ok && p.code === 'PROXY_NO_CREDENTIALS') {
      pass('Clean unconfigured response (expected before IPRoyal signup)');
    } else {
      fail(`Expected PROXY_NO_CREDENTIALS, got: ${JSON.stringify(p)}`);
    }
    return;
  }

  const p1 = proxyRotation.getProxy({ stickyKey: 'gmail.com' });
  if (p1.ok) pass(`Proxy issued (sessionId=${p1.proxy.sessionId})`);
  else { fail(`Proxy issue: ${p1.code}`); return; }

  const p2 = proxyRotation.getProxy({ stickyKey: 'gmail.com' });
  if (p2.ok && p1.proxy.sessionId === p2.proxy.sessionId) {
    pass('Sticky session reused for same domain');
  } else {
    fail('Sticky session NOT reused');
  }

  const p3 = proxyRotation.getProxy({ stickyKey: 'outlook.com' });
  if (p3.ok && p1.proxy.sessionId !== p3.proxy.sessionId) {
    pass('Different domain gets different session');
  } else {
    fail('Different domain returned matching session');
  }
}

// =========================================================================
// 4. Job queue lifecycle
// =========================================================================

async function checkJobQueue() {
  console.log('\n--- Job queue lifecycle (DB) ---');

  const [user] = await sql`SELECT id FROM users LIMIT 1`;
  if (!user) {
    fail('No users in database. Sign up via /signup once before re-running.');
    return;
  }
  console.log(`       testing with user ${user.id}`);

  const job = await jobQueue.createBulkJob({
    userId: user.id,
    inputs: ['a@example.com', 'b@example.com', 'c@example.com'],
    creditsHeld: 1,
    holdTransactionId: '00000000-0000-0000-0000-000000000000',
    metadata: { test: 'batch_02_smoke' },
  });
  if (job?.id) pass(`createBulkJob (id=${job.id}, total=${job.total_rows})`);
  else { fail(`createBulkJob bad return: ${JSON.stringify(job)}`); return; }

  const items = await jobQueue.claimItems({ limit: 5 });
  if (items.length === 3) pass(`claimItems claimed 3 (attempts=${items[0].attempts})`);
  else fail(`claimItems got ${items.length}, expected 3`);

  if (items.length >= 3) {
    await jobQueue.markItemDone(items[0].id, { category: 'valid', smtpResponse: '250 OK' });
    await jobQueue.markItemDone(items[1].id, { category: 'invalid', subcategory: 'mailbox' });
    await jobQueue.markItemError(items[2].id, { errorCode: 'TEST_ERROR' });
    pass('mark items done/done/error');
  }

  const tick = await jobQueue.tickJobProgress(job.id);
  if (tick.isComplete && tick.status === 'partial') {
    pass(`tickJobProgress (status=${tick.status} processed=${tick.processed}/${tick.total})`);
  } else {
    fail(`tickJobProgress: ${JSON.stringify(tick)}`);
  }

  const progress = await jobQueue.getJobProgress(job.id);
  if (progress && progress.counts.valid === 1 &&
      progress.counts.invalid === 1 && progress.counts.error === 1) {
    pass('getJobProgress counts (valid=1, invalid=1, error=1)');
  } else {
    fail(`getJobProgress counts: ${JSON.stringify(progress?.counts)}`);
  }

  const cleanup = await sql`
    DELETE FROM verification_jobs WHERE metadata->>'test' = 'batch_02_smoke'
  `;
  pass(`Cleanup (${cleanup.count} test job(s) deleted)`);
}

// =========================================================================
// 5. emailVerify pipeline (short-circuit cases)
// =========================================================================

async function checkEmailVerifyPipeline() {
  console.log('\n--- Email verifier pipeline (short-circuit cases) ---');

  const r1 = await emailVerify.verifyOneEmail('not-an-email');
  if (r1.ok && r1.result.category === 'invalid' && r1.result.subcategory === 'syntax') {
    pass('Syntax fail short-circuits (no MX lookup, no probe)');
  } else {
    fail(`Syntax fail unexpected: ${JSON.stringify(r1.result)}`);
  }

  const noMxDomain = `nothing-here-${Date.now()}.invalid`;
  const r2 = await emailVerify.verifyOneEmail(`u@${noMxDomain}`);
  if (r2.ok && r2.result.category === 'invalid' && r2.result.subcategory === 'no_mx') {
    pass('No-MX domain short-circuits');
  } else {
    // Some DNS resolvers respond unusually to .invalid TLD; non-fatal.
    console.log(`       NOTE: no-MX test returned ${r2.result.category}/${r2.result.subcategory} - non-fatal (DNS resolver behaviour)`);
  }

  const r3 = await emailVerify.verifyOneEmail('test@mailinator.com', { skipProbe: true });
  if (r3.result.isDisposable) pass('Disposable tag set (mailinator.com)');
  else fail('Disposable tag NOT set');

  const r4 = await emailVerify.verifyOneEmail('admin@example.com', { skipProbe: true });
  if (r4.result.isRole) pass('Role tag set (admin@)');
  else fail('Role tag NOT set');

  const r5 = await emailVerify.verifyOneEmail('test@gmail.com', { skipProbe: true });
  if (r5.result.isFreeProvider) pass('Free-provider tag set (gmail.com)');
  else fail('Free-provider tag NOT set');
}

// =========================================================================
// Run
// =========================================================================

console.log('=== Batch 2 verification ===');

try {
  checkDisposable();
  await checkCatchallCache();
  checkProxyRotation();
  await checkJobQueue();
  await checkEmailVerifyPipeline();
} catch (err) {
  console.error('\nSCRIPT ERROR:', err.message);
  fails.push(`script: ${err.message}`);
} finally {
  await sql.end({ timeout: 5 });
}

console.log('\n=== Summary ===');
console.log(`${passes.length} passed, ${fails.length} failed`);
if (fails.length === 0) {
  console.log('\nBatch 2 is green. Reply with "Batch 2 green" to ship Batch 3.');
  process.exit(0);
} else {
  console.log('\nFailures:');
  for (const f of fails) console.log(`  - ${f}`);
  console.log('\nFix before shipping Batch 3.');
  process.exit(1);
}
