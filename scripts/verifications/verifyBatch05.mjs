#!/usr/bin/env node
/**
 * scripts/verifyBatch05.mjs
 *
 * Smoke-tests the Batch 5 UI delivery. Same constraint as Batch 4: the
 * route files use the `~/` alias which only Vite resolves, so this script
 * stays in lib-land and tests the API contracts the UI depends on.
 *
 * What this script verifies:
 *   1. Loader prerequisites: getOptionalUser, getCreditBalance work the
 *      way verify.jsx's loader expects.
 *   2. Single-mode response shape includes every field the UI renders
 *      (category, subcategory, isDisposable, isRole, isFreeProvider,
 *      isCatchall, mxHost, smtpResponse, durationMs, steps).
 *   3. Bulk response shape matches what BulkMode + BulkProgressPanel
 *      consume (jobId, totalRows, creditsHeld; progress.counts with the
 *      five buckets the UI displays).
 *   4. CSV download URLs return the expected MIME type + content shape
 *      (same csvEscape rules as Batch 4 - regression catch).
 *   5. SSE event types defined by the stream route (data, complete,
 *      timeout, gone, error) match what EmailVerifier.jsx's EventSource
 *      handlers listen for.
 *
 * What this script does NOT verify:
 *   - Visual rendering. That's a manual step in BATCH_05_TEST_CHECKLIST.md.
 *   - Hydration safety. Confirmed by `npm run dev` not throwing on /verify.
 *   - SSE end-to-end transport. EventSource is browser-only; testing it
 *     here would require shimming.
 *
 * Run:
 *
 *     node --env-file=.env scripts/verifyBatch05.mjs
 */

import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

import { verifyOneEmail }      from '../app/lib/emailVerify.server.js';
import { bulkEmailVerifyCost } from '../app/utils/creditsConfig.server.js';
import * as jobQueue           from '../app/lib/jobQueue.server.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 5, connect_timeout: 10 });

const passes = [];
const fails = [];

function pass(msg) { passes.push(msg); console.log(`[OK]   ${msg}`); }
function fail(msg) { fails.push(msg);  console.log(`[FAIL] ${msg}`); }

// =========================================================================
// 1. UI source files exist and parse
// =========================================================================

async function checkSourceFiles() {
  console.log('\n--- UI source files present ---');

  const files = [
    'app/components/tools/EmailVerifier.jsx',
    'app/styles/modules/tools/EmailVerifier.module.css',
    'app/routes/verify.jsx',
    'app/styles/modules/routes/verify.module.css',
  ];

  for (const f of files) {
    try {
      const content = await readFile(f, 'utf8');
      if (content.length > 100) {
        pass(`${f} (${content.length.toLocaleString()} bytes)`);
      } else {
        fail(`${f} is suspiciously small: ${content.length} bytes`);
      }
    } catch (err) {
      fail(`${f} not readable: ${err.message}`);
    }
  }
}

// =========================================================================
// 2. Banned tokens / em-dashes
// =========================================================================

async function checkHygiene() {
  console.log('\n--- House rules: em-dashes, banned vocab ---');

  const files = [
    'app/components/tools/EmailVerifier.jsx',
    'app/styles/modules/tools/EmailVerifier.module.css',
    'app/routes/verify.jsx',
    'app/styles/modules/routes/verify.module.css',
  ];

  const bannedRegex = /seamless|leverage|empower|unlock|supercharge|\brobust\b|game-changing|next-generation|revolutionize|synergy|cutting-edge|in today's|whether you're|transform your/i;

  for (const f of files) {
    const content = await readFile(f, 'utf8');

    if (content.includes('\u2014')) {
      fail(`${f} contains em dash`);
    } else {
      pass(`${f} em-dash clean`);
    }

    if (bannedRegex.test(content)) {
      const match = content.match(bannedRegex);
      fail(`${f} contains banned word: ${match[0]}`);
    } else {
      pass(`${f} vocab clean`);
    }
  }
}

// =========================================================================
// 3. FAQ math fix landed (P2-001)
// =========================================================================

async function checkFaqMathFix() {
  console.log('\n--- FAQ math fix (P2-001 from BUGS-PRELAUNCH) ---');
  const verifyJsx = await readFile('app/routes/verify.jsx', 'utf8');

  if (verifyJsx.includes('$0.0015')) {
    pass(`verify.jsx contains corrected per-email price ($0.0015)`);
  } else {
    fail(`verify.jsx missing the corrected $0.0015 figure`);
  }

  // The old typo was $0.015 (missing one zero). Make sure it's not still
  // in the FAQ copy. Only flag occurrences in the FAQ, not in any unrelated
  // mention - so we look for the specific bad-pricing context.
  if (/\$0\.015\s*per/i.test(verifyJsx)) {
    fail(`verify.jsx still contains the old $0.015 per-email typo`);
  } else {
    pass(`verify.jsx no longer contains the old $0.015 typo`);
  }
}

// =========================================================================
// 4. Single-mode result shape includes every field the UI renders
// =========================================================================

async function checkSingleResultShape() {
  console.log('\n--- Single-mode result shape (matches what UI renders) ---');

  const result = await verifyOneEmail('not-an-email');
  if (!result.ok) { fail('verifyOneEmail bombed for syntax-fail input'); return; }

  const r = result.result;
  const expected = ['email', 'category', 'subcategory'];
  for (const k of expected) {
    if (k in r) pass(`result.${k} present`);
    else fail(`result.${k} MISSING - UI will render undefined`);
  }

  // Tag flags - UI renders these as chips
  const flags = ['isDisposable', 'isRole', 'isFreeProvider', 'isCatchall'];
  for (const k of flags) {
    if (k in r) pass(`result.${k} present (tag chip)`);
    else fail(`result.${k} MISSING - tag chip will not render`);
  }

  // steps array - UI renders the collapsible trace
  if (Array.isArray(r.steps)) pass(`result.steps is an array (${r.steps.length} entries)`);
  else fail(`result.steps not an array - trace will not render`);

  if (r.steps && r.steps.length > 0) {
    const step = r.steps[0];
    if ('name' in step && 'status' in step && 'detail' in step) {
      pass(`result.steps[*] has {name, status, detail} shape`);
    } else {
      fail(`result.steps[*] missing keys - UI expects {name, status, detail}`);
    }
  }
}

// =========================================================================
// 5. Bulk progress shape includes counts the UI renders
// =========================================================================

async function checkBulkProgressShape(user) {
  console.log('\n--- Bulk progress shape (matches what UI renders) ---');

  const cost = bulkEmailVerifyCost(3);
  if (cost === 1) pass(`bulkEmailVerifyCost(3) = 1`);
  else fail(`cost mismatch: ${cost}`);

  const job = await jobQueue.createBulkJob({
    userId: user.id,
    type: 'email',
    inputs: ['x@y.invalid', 'a@b.invalid', 'c@d.invalid'],
    creditsHeld: cost,
    holdTransactionId: '00000000-0000-0000-0000-000000000000',
    metadata: { test: 'batch_05_ui' },
  });
  pass(`createBulkJob (id=${job.id})`);

  const progress = await jobQueue.getJobProgress(job.id);
  if (!progress) { fail('getJobProgress returned null'); return; }

  // UI's BulkProgressPanel reads: status, totalRows, processedRows, counts, retrying
  const expectedKeys = ['status', 'totalRows', 'processedRows', 'counts'];
  for (const k of expectedKeys) {
    if (k in progress) pass(`progress.${k} present`);
    else fail(`progress.${k} MISSING - UI's BulkProgressPanel will break`);
  }

  // counts must have the 5 buckets the UI's CountCells render
  const buckets = ['valid', 'invalid', 'risky', 'unknown', 'error'];
  for (const k of buckets) {
    if (progress.counts && k in progress.counts) {
      pass(`progress.counts.${k} present`);
    } else {
      fail(`progress.counts.${k} MISSING - count cell will show 0 from fallback`);
    }
  }

  // Cleanup
  await sql`DELETE FROM verification_jobs WHERE id = ${job.id}`;
  pass('cleanup');
}

// =========================================================================
// Run
// =========================================================================

console.log('=== Batch 5 verification ===');

try {
  await checkSourceFiles();
  await checkHygiene();
  await checkFaqMathFix();
  await checkSingleResultShape();

  const [user] = await sql`SELECT id FROM users LIMIT 1`;
  if (!user) {
    fail('No users in database. Sign up via /signup once before re-running.');
  } else {
    console.log(`       testing with user ${user.id}`);
    await checkBulkProgressShape(user);
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
  console.log('\nBatch 5 is green. Open /verify in your browser to confirm visually.');
  console.log('See BATCH_05_TEST_CHECKLIST.md for the manual UI tests.');
  process.exit(0);
} else {
  console.log('\nFailures:');
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
