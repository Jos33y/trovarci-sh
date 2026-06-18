#!/usr/bin/env node
/**
 * scripts/verifyBatch03.mjs
 *
 * Smoke-tests the worker layer dropped in Batch 3 of the Email Verifier.
 *
 * Run:
 *
 *     node --env-file=.env scripts/verifyBatch03.mjs
 *
 * (Node 20+. If you're on an older Node, run via dotenv-cli instead:
 *  npx dotenv -e .env -- node scripts/verifyBatch03.mjs)
 *
 * Exit code: 0 if all checks pass, 1 otherwise.
 *
 * Sections:
 *   1. health module: payload shape, HTTP server start/stop on a free port
 *   2. emailProcessor: end-to-end with syntax-fail items (no proxy needed)
 *   3. emailProcessor: end-to-end with no-MX items (no proxy needed)
 *   4. emailProcessor: infra-failure path retries (when no proxy is set)
 *   5. cleanup
 *
 * Worker-aware behaviour:
 *   The script auto-detects whether a worker process is listening on
 *   :3001 (via GET /health). If so, the syntax-fail and no-MX tests
 *   create their job and wait for the worker to process it through the
 *   normal queue, then verify the outcome - same final assertions,
 *   different execution path. The infra-retry test is skipped when a
 *   worker is running because it depends on controlling the claim
 *   timing manually (the worker would race for the same items).
 *
 *   When no worker is running, all tests claim items directly via
 *   jobQueue.claimItems and call processItem() in-process.
 *
 *   Either mode is a valid pass.
 *
 * IPRoyal is NOT required. Items that need the SMTP probe will return
 * PROXY_NO_CREDENTIALS, which the processor handles via its infra-retry
 * branch.
 */

// Set a non-default health port so we don't clash with anything that
// might be listening on 3001. Must be done BEFORE importing health.js.
process.env.WORKER_HEALTH_PORT = process.env.WORKER_HEALTH_PORT || '3099';

import postgres from 'postgres';

import * as jobQueue       from '../app/lib/jobQueue.server.js';
import * as emailProcessor from '../worker/emailProcessor.js';
import * as health         from '../worker/health.js';

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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =========================================================================
// Worker detection
// =========================================================================

/**
 * Probe :3001/health to see if a worker is running. Confirms the response
 * shape so we don't false-positive on something else listening there.
 */
async function isWorkerRunning() {
  try {
    const res = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(500) });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return !!(body && body.ok === true && typeof body.disposableListCount === 'number');
  } catch {
    return false;
  }
}

/**
 * Poll the job until it reaches a terminal status, with a timeout.
 * Used when the worker is processing on our behalf.
 */
async function waitForJobTerminal(jobId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(300);
    const p = await jobQueue.getJobProgress(jobId);
    if (p && ['complete', 'partial', 'failed', 'cancelled'].includes(p.status)) return p;
  }
  return null;
}

// =========================================================================
// 1. Health module
// =========================================================================

async function checkHealthModule() {
  console.log('\n--- Health module ---');

  // Payload shape (without spinning up the server)
  const payload = health._buildHealthPayloadForTests();
  if (payload && payload.ok === true) pass('payload shape: ok=true');
  else fail(`payload shape: got ${JSON.stringify(payload)}`);

  if (typeof payload.uptimeSeconds === 'number') pass('payload has uptimeSeconds');
  else fail('payload missing uptimeSeconds');

  if (payload.counters && typeof payload.counters.itemsProcessed === 'number') {
    pass('payload counters present');
  } else {
    fail('payload counters missing');
  }

  if (typeof payload.disposableListCount === 'number' && payload.disposableListCount > 0) {
    pass(`payload disposableListCount=${payload.disposableListCount.toLocaleString()}`);
  } else {
    fail(`payload disposableListCount unexpected: ${payload.disposableListCount}`);
  }

  // HTTP cycle (uses port 3099 so it never clashes with a running worker on 3001)
  try {
    await health.startHealthServer();
    pass('startHealthServer succeeded');

    const port = process.env.WORKER_HEALTH_PORT;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (res.status === 200) pass(`GET /health returns 200`);
    else fail(`GET /health returned ${res.status}`);

    const body = await res.json();
    if (body.ok === true) pass('GET /health body has ok=true');
    else fail(`GET /health body: ${JSON.stringify(body)}`);

    await health.stopHealthServer();
    pass('stopHealthServer succeeded');
  } catch (err) {
    fail(`HTTP cycle failed: ${err.message}`);
    try { await health.stopHealthServer(); } catch {}
  }

  // Counter recording
  health.recordTick(0);
  health.recordTick(5);
  health.recordItemDone();
  health.recordItemDone();
  const after = health._buildHealthPayloadForTests();
  if (after.counters.ticksWithWork >= 1 && after.counters.ticksIdle >= 1 && after.counters.itemsProcessed >= 2) {
    pass(`counters update (work=${after.counters.ticksWithWork} idle=${after.counters.ticksIdle} items=${after.counters.itemsProcessed})`);
  } else {
    fail(`counters did not update: ${JSON.stringify(after.counters)}`);
  }
}

// =========================================================================
// Helpers for the end-to-end tests
// =========================================================================

async function getTestUser() {
  const [user] = await sql`SELECT id FROM users LIMIT 1`;
  return user || null;
}

async function fetchFinalState(jobId) {
  const items = await sql`
    SELECT id, status, category, subcategory, error_code, attempts
    FROM verification_job_items
    WHERE job_id = ${jobId}
    ORDER BY row_index
  `;
  const [job] = await sql`
    SELECT id, status, processed_rows, total_rows
    FROM verification_jobs
    WHERE id = ${jobId}
  `;
  return { items, job };
}

/**
 * Drive a job to completion via either path:
 *   - workerRunning=true  -> wait for worker to finalize through its poll cycle
 *   - workerRunning=false -> claim items in-process and call processItem on each
 *
 * Returns the path taken so the calling test can branch on assertion fidelity.
 */
async function driveJobToCompletion(jobId, workerRunning, expectedItemCount) {
  if (workerRunning) {
    const terminal = await waitForJobTerminal(jobId, 10_000);
    if (!terminal) return { path: 'worker', ok: false, reason: 'worker did not finish job within 10s' };
    return { path: 'worker', ok: true };
  }

  const items = await jobQueue.claimItems({ limit: 100 });
  if (items.length !== expectedItemCount) {
    return { path: 'in-process', ok: false, reason: `claimItems got ${items.length}, expected ${expectedItemCount}` };
  }
  for (const item of items) {
    await emailProcessor.processItem(item);
  }
  return { path: 'in-process', ok: true, claimed: items.length };
}

// =========================================================================
// 2. emailProcessor end-to-end with syntax-fail items
// =========================================================================

async function checkSyntaxFailEndToEnd(user, workerRunning) {
  console.log('\n--- emailProcessor: syntax-fail items end-to-end ---');

  const job = await jobQueue.createBulkJob({
    userId:            user.id,
    inputs:            ['not-an-email', 'also-bad', '@@'],
    creditsHeld:       1,
    holdTransactionId: '00000000-0000-0000-0000-000000000000',
    metadata:          { test: 'batch_03_syntax' },
  });
  pass(`createBulkJob (id=${job.id})`);

  const drive = await driveJobToCompletion(job.id, workerRunning, 3);
  if (drive.ok) {
    pass(`drove to completion via ${drive.path}` + (drive.claimed != null ? ` (claimed ${drive.claimed})` : ''));
  } else {
    fail(`drive failed via ${drive.path}: ${drive.reason}`);
    return;
  }

  const { items: finalItems, job: finalJob } = await fetchFinalState(job.id);

  if (finalItems.every((i) => i.status === 'done')) pass('all items terminal status=done');
  else fail(`item statuses: ${finalItems.map((i) => i.status).join(', ')}`);

  if (finalItems.every((i) => i.category === 'invalid' && i.subcategory === 'syntax')) {
    pass('all items classified as invalid/syntax');
  } else {
    fail(`items: ${JSON.stringify(finalItems.map((i) => ({ c: i.category, s: i.subcategory })))}`);
  }

  if (finalJob.status === 'complete') pass(`job status=complete (processed=${finalJob.processed_rows}/${finalJob.total_rows})`);
  else fail(`job status=${finalJob.status}, expected complete`);
}

// =========================================================================
// 3. emailProcessor end-to-end with no-MX items
// =========================================================================

async function checkNoMxEndToEnd(user, workerRunning) {
  console.log('\n--- emailProcessor: no-MX items end-to-end ---');

  const stamp = Date.now();
  const job = await jobQueue.createBulkJob({
    userId:            user.id,
    inputs:            [`u@no-mx-${stamp}-1.invalid`, `u@no-mx-${stamp}-2.invalid`],
    creditsHeld:       1,
    holdTransactionId: '00000000-0000-0000-0000-000000000000',
    metadata:          { test: 'batch_03_nomx' },
  });
  pass(`createBulkJob (id=${job.id})`);

  const drive = await driveJobToCompletion(job.id, workerRunning, 2);
  if (drive.ok) {
    pass(`drove to completion via ${drive.path}` + (drive.claimed != null ? ` (claimed ${drive.claimed})` : ''));
  } else {
    fail(`drive failed via ${drive.path}: ${drive.reason}`);
    return;
  }

  const { items: finalItems } = await fetchFinalState(job.id);

  // Some DNS resolvers respond unusually to the .invalid TLD; allow either
  // 'done' or 'error' as terminal. Both prove the processor finalized the row.
  if (finalItems.every((i) => i.status === 'done' || i.status === 'error')) {
    pass('all items reached terminal state');
  } else {
    fail(`item statuses: ${finalItems.map((i) => i.status).join(', ')}`);
  }
}

// =========================================================================
// 4. emailProcessor infra-failure retry path
// =========================================================================

async function checkInfraRetryPath(user, workerRunning) {
  console.log('\n--- emailProcessor: infra-failure retry path (no proxy configured) ---');

  if (workerRunning) {
    console.log('       SKIP: a running worker would race for the test items and process them on its own');
    console.log('       schedule (the retry happens 30s later, so verifying it would block the test).');
    console.log('       Stop the worker and re-run if you want this branch covered.');
    return;
  }

  const proxyConfigured = !!(process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD);
  if (proxyConfigured) {
    console.log('       SKIP: PROXY_USERNAME is set - this test only exercises the unconfigured-proxy path.');
    return;
  }

  const job = await jobQueue.createBulkJob({
    userId:            user.id,
    inputs:            ['test@gmail.com'],
    creditsHeld:       1,
    holdTransactionId: '00000000-0000-0000-0000-000000000000',
    metadata:          { test: 'batch_03_infra' },
  });
  pass(`createBulkJob (id=${job.id})`);

  // First processing attempt: should hit PROXY_NO_CREDENTIALS, scheduled
  // for retry (not marked error yet).
  const [item1] = await jobQueue.claimItems({ limit: 1 });
  if (!item1) { fail('claimItems returned nothing on first attempt'); return; }
  await emailProcessor.processItem(item1);

  const after1 = await sql`SELECT status, attempts, next_retry FROM verification_job_items WHERE id = ${item1.id}`;
  if (after1[0].status === 'pending' && after1[0].next_retry !== null) {
    pass(`first attempt scheduled for retry (attempts=${after1[0].attempts})`);
  } else {
    fail(`first attempt unexpected: status=${after1[0].status} next_retry=${after1[0].next_retry}`);
  }

  // Force the next_retry into the past so the next claim picks it up.
  await sql`UPDATE verification_job_items SET next_retry = now() - interval '1 second' WHERE id = ${item1.id}`;

  // Second attempt: retry budget exhausted, should mark error.
  const [item2] = await jobQueue.claimItems({ limit: 1 });
  if (!item2 || item2.id !== item1.id) {
    fail(`expected to re-claim same item, got ${JSON.stringify(item2)}`);
    return;
  }
  await emailProcessor.processItem(item2);

  const after2 = await sql`SELECT status, error_code, attempts FROM verification_job_items WHERE id = ${item1.id}`;
  if (after2[0].status === 'error' && after2[0].error_code) {
    pass(`second attempt marked error (code=${after2[0].error_code}, attempts=${after2[0].attempts})`);
  } else {
    fail(`second attempt unexpected: status=${after2[0].status} error_code=${after2[0].error_code}`);
  }
}

async function checkCleanup() {
  console.log('\n--- Cleanup test rows ---');
  const result = await sql`
    DELETE FROM verification_jobs
    WHERE metadata->>'test' IN ('batch_03_syntax', 'batch_03_nomx', 'batch_03_infra')
  `;
  pass(`Cleanup (${result.count} test job(s) deleted)`);
}

// =========================================================================
// Run
// =========================================================================

console.log('=== Batch 3 verification ===');

let workerRunning = false;

try {
  await checkHealthModule();

  workerRunning = await isWorkerRunning();
  if (workerRunning) {
    console.log('\n[NOTE] Worker process detected on :3001. End-to-end tests will verify outcomes via the worker.');
  } else {
    console.log('\n[NOTE] No worker detected on :3001. End-to-end tests will run processItem in-process.');
  }

  const user = await getTestUser();
  if (!user) {
    fail('No users in database. Sign up via /signup once before re-running.');
  } else {
    console.log(`       testing with user ${user.id}`);
    await checkSyntaxFailEndToEnd(user, workerRunning);
    await checkNoMxEndToEnd(user, workerRunning);
    await checkInfraRetryPath(user, workerRunning);
    await checkCleanup();
  }
} catch (err) {
  console.error('\nSCRIPT ERROR:', err.message);
  fails.push(`script: ${err.message}`);
} finally {
  await sql.end({ timeout: 5 });
}

console.log('\n=== Summary ===');
console.log(`${passes.length} passed, ${fails.length} failed`);
if (fails.length === 0) {
  console.log('\nBatch 3 is green. Reply with "Batch 3 green" to ship Batch 4.');
  process.exit(0);
} else {
  console.log('\nFailures:');
  for (const f of fails) console.log(`  - ${f}`);
  console.log('\nFix before shipping Batch 4.');
  process.exit(1);
}
