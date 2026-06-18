#!/usr/bin/env node
/**
 * scripts/demoBulkJob.mjs
 *
 * Interactive demo: creates a small bulk verification job, waits for the
 * worker to process it, prints the final state. Used to exercise the
 * worker pipeline manually after Batch 3 lands.
 *
 * Run (in one terminal):
 *
 *     npm run worker:dev
 *
 * Run (in another terminal):
 *
 *     node --env-file=.env scripts/demoBulkJob.mjs
 *
 * Without the worker running, the job sits in 'pending' until the 30s
 * timeout - that's the failure mode you should see if the worker is not
 * up.
 *
 * Inputs are syntax-fail emails so no proxy is required. The worker
 * classifies all three as invalid/syntax via the short-circuit path
 * before ever touching IPRoyal or an MX server.
 *
 * Output style is event-stream (not pass/fail) since this is a demo not
 * a test. The verify scripts (verifyBatchNN.mjs) own the test surface;
 * demo scripts own the manual-exercise surface.
 */

import postgres from 'postgres';
import * as jobQueue from '../app/lib/jobQueue.server.js';

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
  console.log(`[${label.padEnd(6)}] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log('=== Bulk job demo ===');

let exitCode = 0;
let createdJobId = null;

try {
  // Step 1: find a user (the script does the lookup; no inline UUIDs needed)
  const [user] = await sql`SELECT id, email FROM users ORDER BY created_at LIMIT 1`;
  if (!user) {
    console.error('No users in database. Sign up via /signup first.');
    exitCode = 1;
  } else {
    log('user', `${user.email} (${user.id})`);

    // Step 2: create the bulk job
    const job = await jobQueue.createBulkJob({
      userId:             user.id,
      inputs:             ['not-an-email', 'also-bad', '@@@'],
      creditsHeld:        1,
      holdTransactionId:  '00000000-0000-0000-0000-000000000000',
      metadata:           { test: 'manual_e2e', createdBy: 'demoBulkJob.mjs' },
    });
    createdJobId = job.id;
    log('job',  `created ${job.id} (${job.total_rows} items, status=${job.status})`);

    // Step 3: poll for terminal status
    log('poll', `waiting for terminal status (timeout ${POLL_TIMEOUT_MS / 1000}s)...`);
    const startedAt = Date.now();
    let lastStatus = job.status;

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const progress = await jobQueue.getJobProgress(job.id);
      if (!progress) { log('poll', 'job vanished?!'); break; }

      if (progress.status !== lastStatus) {
        log('poll', `${lastStatus} -> ${progress.status} (processed=${progress.processedRows}/${progress.totalRows})`);
        lastStatus = progress.status;
      }

      if (['complete', 'partial', 'cancelled', 'failed'].includes(progress.status)) {
        log('poll', 'terminal status reached');
        break;
      }
    }

    // Step 4: print final state
    const finalProgress = await jobQueue.getJobProgress(job.id);
    const items = await sql`
      SELECT row_index, input, status, category, subcategory, error_code, attempts
      FROM verification_job_items
      WHERE job_id = ${job.id}
      ORDER BY row_index
    `;

    console.log('\n--- final job ---');
    console.log(`status:    ${finalProgress.status}`);
    console.log(`processed: ${finalProgress.processedRows}/${finalProgress.totalRows}`);
    console.log(`counts:    valid=${finalProgress.counts.valid} invalid=${finalProgress.counts.invalid} risky=${finalProgress.counts.risky} unknown=${finalProgress.counts.unknown} error=${finalProgress.counts.error}`);

    console.log('\n--- items ---');
    for (const item of items) {
      const verdict = item.status === 'done'
        ? `${item.category || '-'}/${item.subcategory || '-'}`
        : item.status === 'error'
          ? `error: ${item.error_code}`
          : `(${item.status})`;
      console.log(`  [${item.row_index}] ${(item.input || '').padEnd(20)} ${verdict}`);
    }

    // Step 5: outcome and cleanup hint
    console.log('');
    if (finalProgress.status === 'complete' && finalProgress.counts.invalid === 3) {
      console.log('Demo successful: worker classified all 3 items as invalid/syntax.');
    } else if (['pending', 'processing'].includes(finalProgress.status)) {
      console.log('Job did not reach terminal status within timeout.');
      console.log('Is the worker running? Try: npm run worker:dev');
      exitCode = 1;
    } else {
      console.log(`Job ended in status=${finalProgress.status}. Inspect items above.`);
    }
  }
} catch (err) {
  console.error('\nSCRIPT ERROR:', err.message);
  exitCode = 1;
} finally {
  if (createdJobId) {
    try {
      const cleanup = await sql`DELETE FROM verification_jobs WHERE id = ${createdJobId}`;
      console.log(`\n--- cleanup ---\nDeleted ${cleanup.count} demo job row.`);
    } catch (err) {
      console.error('cleanup failed:', err.message);
    }
  }
  await sql.end({ timeout: 5 });
}

process.exit(exitCode);
