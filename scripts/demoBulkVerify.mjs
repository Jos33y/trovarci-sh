#!/usr/bin/env node
/**
 * scripts/demoBulkVerify.mjs
 *
 * Interactive demo of the bulk endpoint flow. Walks through what
 * /api/tools/verify-email-bulk + the job status/results/cancel endpoints
 * do at the lib level. Use this to see the credit hold, job lifecycle,
 * progress polling, CSV generation, and refund-on-cancel math without
 * needing the dev server.
 *
 * Run (in one terminal):
 *
 *     npm run worker:dev
 *
 * Run (in another terminal):
 *
 *     node --env-file=.env scripts/demoBulkVerify.mjs
 *
 * The demo creates a small bulk job (3 syntax-fail inputs - no proxy
 * needed), waits for the worker to process it, fetches the result CSV,
 * and prints a sample. Cleans up its test row at the end.
 */

import postgres from 'postgres';
import * as jobQueue           from '../app/lib/jobQueue.server.js';
import { bulkEmailVerifyCost } from '../app/utils/creditsConfig.server.js';

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS  = 30_000;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Run with --env-file=.env.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

function log(label, msg) {
  console.log(`[${label.padEnd(8)}] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log('=== Bulk verify demo ===\n');

let exitCode = 0;
let jobId = null;

try {
  // Step 1: pick a user (mirrors what requireUser would resolve to)
  const [user] = await sql`SELECT id, email FROM users ORDER BY created_at LIMIT 1`;
  if (!user) {
    console.error('No users in database. Sign up via /signup first.');
    exitCode = 1;
  } else {
    log('user', `${user.email} (${user.id})`);

    // Step 2: simulate the route's cost computation
    const inputs = ['not-an-email', 'also-bad', '@@@'];
    const cost = bulkEmailVerifyCost(inputs.length);
    log('cost', `bulkEmailVerifyCost(${inputs.length}) = ${cost} credit(s)`);
    log('route', `the route /api/tools/verify-email-bulk would spendCredits ${cost} here`);

    // Step 3: create the job (mirrors createBulkJob call after spend)
    const job = await jobQueue.createBulkJob({
      userId:            user.id,
      type:              'email',
      inputs,
      creditsHeld:       cost,
      holdTransactionId: '00000000-0000-0000-0000-000000000000',
      metadata:          { test: 'manual_e2e', createdBy: 'demoBulkVerify.mjs' },
    });
    jobId = job.id;
    log('job', `created ${job.id} (${job.total_rows} items, status=${job.status})`);
    log('http', `the route would respond: { ok: true, jobId, totalRows: 3, creditsHeld: ${cost} }`);

    // Step 4: poll progress (mirrors GET /api/jobs/:jobId/status loop)
    log('poll', `simulating client polling /api/jobs/${jobId.slice(0, 8)}.../status...`);
    const startedAt = Date.now();
    let lastStatus = job.status;

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const progress = await jobQueue.getJobProgress(job.id);
      if (!progress) { log('poll', 'job vanished'); break; }
      if (progress.status !== lastStatus) {
        log('poll', `${lastStatus} -> ${progress.status} (processed=${progress.processedRows}/${progress.totalRows})`);
        lastStatus = progress.status;
      }
      if (['complete', 'partial', 'cancelled', 'failed'].includes(progress.status)) {
        log('poll', 'terminal status reached');
        break;
      }
    }

    const finalProgress = await jobQueue.getJobProgress(job.id);

    // Step 5: simulate the results route by fetching items + building CSV
    if (['complete', 'partial'].includes(finalProgress.status)) {
      log('http', `the route GET /api/jobs/${jobId.slice(0, 8)}.../results would now stream a CSV like:`);
      const items = await sql`
        SELECT row_index, input AS email, status, category, subcategory
        FROM verification_job_items
        WHERE job_id = ${job.id}
        ORDER BY row_index
      `;
      console.log('');
      console.log('         email,status,category,subcategory');
      for (const i of items) {
        console.log(`         ${i.email},${i.status},${i.category || ''},${i.subcategory || ''}`);
      }
      console.log('');

      log('http', `and ?clean=1 would return only valid emails (none in this demo since all are syntax-fail)`);
    } else {
      log('poll', `did not reach terminal status. Is the worker running? Try: npm run worker:dev`);
      exitCode = 1;
    }

    // Step 6: show what cancel + refund would have looked like (non-destructive)
    console.log('');
    log('cancel', `refund math for this job IF cancelled at processed=${finalProgress.processedRows}:`);
    const creditsKept = bulkEmailVerifyCost(finalProgress.processedRows);
    const refund = Math.max(0, cost - creditsKept);
    log('cancel', `  creditsKept = bulkEmailVerifyCost(${finalProgress.processedRows}) = ${creditsKept}`);
    log('cancel', `  refund      = ${cost} - ${creditsKept} = ${refund}`);

    if (finalProgress.status === 'complete') {
      console.log('\nDemo successful: full route flow exercised end to end.');
    }
  }
} catch (err) {
  console.error('\nSCRIPT ERROR:', err.message);
  exitCode = 1;
} finally {
  if (jobId) {
    try {
      const cleanup = await sql`DELETE FROM verification_jobs WHERE id = ${jobId}`;
      console.log(`\n--- cleanup ---\nDeleted ${cleanup.count} demo job row.`);
    } catch (err) {
      console.error('cleanup failed:', err.message);
    }
  }
  await sql.end({ timeout: 5 });
}

process.exit(exitCode);
