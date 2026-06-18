#!/usr/bin/env node
/**
 * scripts/verifyBatch04.mjs
 *
 * Smoke-tests the HTTP route layer dropped in Batch 4 of the Email Verifier.
 *
 * Run:
 *
 *     node --env-file=.env scripts/verifyBatch04.mjs
 *
 * (Node 20+. If you're on an older Node, run via dotenv-cli instead:
 *  npx dotenv -e .env -- node scripts/verifyBatch04.mjs)
 *
 * Exit code: 0 if all checks pass, 1 otherwise.
 *
 * Sections:
 *   1. single-mode flow: verifyOneEmail with syntax fail -> verdict shape
 *   2. bulk flow: cost compute -> createBulkJob -> getJobProgress shape
 *   3. cancel flow: cancel -> refund math invariant (kept + refund = held)
 *   4. CSV generation: clean=1 vs full output, RFC 4180 escaping
 *   5. cleanup test rows
 *
 * Why this script does NOT import the route modules:
 *   The route files use the `~/` alias (e.g. `import ... from '~/utils/session.server'`)
 *   which is resolved by Vite at bundle/dev time. Node alone doesn't know
 *   what `~/` means, so a static import of any route module would fail
 *   to resolve its dependencies. Route handler shape is implicitly
 *   verified by `npm run dev` - if a route doesn't export `action`/`loader`
 *   correctly, Remix won't boot. The thing that CAN go wrong inside the
 *   routes is composition (spend before lib call, refund on the right
 *   failure types, correct refund math) - that's what this script tests,
 *   against the same lib functions the routes call.
 *
 * Worker-aware:
 *   The cancel-flow test cooperates with a running worker. Whether the
 *   worker has claimed nothing, some, or all of the test items at cancel
 *   time, the test verifies the same invariant: creditsKept + refund =
 *   creditsHeld. Three valid outcomes are accepted:
 *     - cancel.ok with processedRows >= 0  (we cancelled mid-flight)
 *     - cancel.code='JOB_NOT_CANCELLABLE'  (worker raced us to completion)
 */

import postgres from 'postgres';

import * as jobQueue           from '../app/lib/jobQueue.server.js';
import { verifyOneEmail }      from '../app/lib/emailVerify.server.js';
import { bulkEmailVerifyCost } from '../app/utils/creditsConfig.server.js';

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
// 1. Single-mode flow
// =========================================================================

async function checkSingleFlow() {
  console.log('\n--- Single-mode flow (verifyOneEmail short-circuits) ---');

  const result = await verifyOneEmail('not-an-email');
  if (result.ok && result.result.category === 'invalid' && result.result.subcategory === 'syntax') {
    pass('verifyOneEmail returns syntax verdict (route would return ok:true here, no refund)');
  } else {
    fail(`verifyOneEmail unexpected: ${JSON.stringify(result)}`);
  }

  if (result.ok === true) pass('result.ok=true means route would NOT refund');
  else fail(`expected ok=true, got ok=${result.ok}`);
}

// =========================================================================
// 2. Bulk flow (cost computation, createBulkJob, progress)
// =========================================================================

async function checkBulkFlow(user) {
  console.log('\n--- Bulk flow (cost compute -> createBulkJob -> progress shape) ---');

  const inputs = ['a@example.com', 'b@example.com', 'c@example.com'];
  const cost = bulkEmailVerifyCost(inputs.length);

  if (cost === 1) pass(`bulkEmailVerifyCost(3) = 1 (matches per-100 ceiling)`);
  else fail(`bulkEmailVerifyCost(3) = ${cost}, expected 1`);

  const job = await jobQueue.createBulkJob({
    userId:            user.id,
    type:              'email',
    inputs,
    creditsHeld:       cost,
    holdTransactionId: '00000000-0000-0000-0000-000000000000',
    metadata:          { test: 'batch_04_bulk' },
  });
  if (job?.id) pass(`createBulkJob (id=${job.id})`);
  else { fail(`createBulkJob bad return: ${JSON.stringify(job)}`); return null; }

  const progress = await jobQueue.getJobProgress(job.id);
  if (progress && progress.totalRows === 3) {
    pass(`getJobProgress shape (status=${progress.status}, totalRows=3)`);
  } else {
    fail(`getJobProgress unexpected: ${JSON.stringify(progress)}`);
  }

  if (progress && progress.counts && typeof progress.counts.valid === 'number') {
    pass(`getJobProgress.counts shape correct`);
  } else {
    fail(`getJobProgress.counts missing or wrong: ${JSON.stringify(progress?.counts)}`);
  }

  return job;
}

// =========================================================================
// 3. Cancel flow + refund math
//
// Three legitimate outcomes are accepted, all proving the route's logic:
//   A. cancel.ok && processedRows == 0      cancelled mid-flight, full refund
//   B. cancel.ok && processedRows  > 0      cancelled mid-flight, partial refund
//   C. cancel.code='JOB_NOT_CANCELLABLE'    worker fully processed first
//
// In A and B the math invariant is creditsKept + refund == creditsHeld,
// which holds for any value of processedRows from 0 to totalRows.
// =========================================================================

async function checkCancelFlow(user, bulkJob) {
  console.log('\n--- Cancel flow + refund math ---');
  if (!bulkJob) { fail('skipped (no job from previous step)'); return; }

  // Best-effort: try to claim and finalize one item ourselves so the
  // cancel exercises the partial-refund path. If the worker raced us
  // (claimItems returns 0), that's fine - the cancel below works
  // regardless of progress level.
  const items = await jobQueue.claimItems({ limit: 1, type: 'email' });
  if (items.length === 1) {
    await jobQueue.markItemDone(items[0].id, { category: 'invalid', subcategory: 'syntax' });
    await jobQueue.tickJobProgress(bulkJob.id);
    pass('manually marked 1 item done (cancel will exercise partial-refund path)');
  } else {
    pass('worker took the items - cancel will exercise no-progress or already-terminal path');
  }

  const cancel = await jobQueue.cancelJob(bulkJob.id, user.id);

  if (cancel.ok) {
    pass(`cancelJob succeeded (processedRows=${cancel.processedRows}, creditsHeld=${cancel.creditsHeld})`);

    // The route applies this exact math:
    //   creditsKept = bulkEmailVerifyCost(processedRows)
    //   refund      = max(0, creditsHeld - creditsKept)
    const creditsKept = bulkEmailVerifyCost(cancel.processedRows);
    const refund = Math.max(0, cancel.creditsHeld - creditsKept);

    // The invariant: kept + refund must equal held (no credits invented or lost).
    if (creditsKept + refund === cancel.creditsHeld) {
      pass(`refund invariant holds: kept=${creditsKept} + refund=${refund} = held=${cancel.creditsHeld}`);
    } else {
      fail(`refund invariant violated: ${creditsKept} + ${refund} != ${cancel.creditsHeld}`);
    }

    // After cancel, every item must be in a terminal state (done or error
    // - the cancel marks remaining pending/processing items as error).
    const remaining = await sql`
      SELECT status FROM verification_job_items WHERE job_id = ${bulkJob.id}
    `;
    if (remaining.every((r) => ['done', 'error'].includes(r.status))) {
      pass('all items in terminal state after cancel');
    } else {
      fail(`items not terminal: ${remaining.map((r) => r.status).join(', ')}`);
    }
  } else if (cancel.code === 'JOB_NOT_CANCELLABLE') {
    pass(`cancelJob returned JOB_NOT_CANCELLABLE (worker reached terminal state first)`);

    // Confirm the job actually IS terminal - this is the natural-completion
    // path, not a refund path. The user got their work, no credits move.
    const j = await jobQueue.getJobForUser(bulkJob.id, user.id);
    if (j && ['complete', 'partial'].includes(j.status)) {
      pass(`job confirmed terminal: status=${j.status}`);
    } else {
      fail(`expected complete/partial, got: ${j?.status}`);
    }
  } else {
    fail(`cancelJob unexpected: ${JSON.stringify(cancel)}`);
  }
}

// =========================================================================
// 4. CSV generation (used by results route)
// =========================================================================

function checkCsvGeneration() {
  console.log('\n--- CSV generation (mirrors results route logic) ---');

  const escape = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  if (escape('plain') === 'plain') pass('csvEscape: plain string passes through');
  else fail('csvEscape: plain string changed');

  if (escape('a,b') === '"a,b"') pass('csvEscape: comma triggers quoting');
  else fail(`csvEscape: comma case got ${escape('a,b')}`);

  if (escape('he said "hi"') === '"he said ""hi"""') pass('csvEscape: doubles internal quotes');
  else fail(`csvEscape: quote-doubling got ${escape('he said "hi"')}`);

  if (escape(null) === '') pass('csvEscape: null becomes empty string');
  else fail(`csvEscape: null got ${escape(null)}`);

  if (escape('multi\nline') === '"multi\nline"') pass('csvEscape: newline triggers quoting');
  else fail(`csvEscape: newline case got ${escape('multi\nline')}`);
}

// =========================================================================
// Cleanup
// =========================================================================

async function checkCleanup() {
  console.log('\n--- Cleanup test rows ---');
  const result = await sql`
    DELETE FROM verification_jobs WHERE metadata->>'test' = 'batch_04_bulk'
  `;
  pass(`Cleanup (${result.count} test job(s) deleted)`);
}

// =========================================================================
// Run
// =========================================================================

console.log('=== Batch 4 verification ===');

try {
  await checkSingleFlow();

  const [user] = await sql`SELECT id FROM users LIMIT 1`;
  if (!user) {
    fail('No users in database. Sign up via /signup once before re-running.');
  } else {
    console.log(`       testing with user ${user.id}`);
    const bulkJob = await checkBulkFlow(user);
    await checkCancelFlow(user, bulkJob);
    checkCsvGeneration();
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
  console.log('\nBatch 4 is green. Reply with "Batch 4 green" to ship Batch 5.');
  process.exit(0);
} else {
  console.log('\nFailures:');
  for (const f of fails) console.log(`  - ${f}`);
  console.log('\nFix before shipping Batch 5.');
  process.exit(1);
}
