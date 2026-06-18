#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/verifyBatch07A.mjs

   Smoke test for Bulk Number Verifier sub-batch 7A (backend foundations).

   This script does NOT require the bulk API route or UI to exist. It
   tests the foundations directly by:

     1. Asserting the migration has been applied (vji_subcategory_valid
        accepts phone subcategories like 'mobile' and 'format_invalid')
     2. Asserting the new pricing helpers (bulkPhoneVerifyCost, bulkCost)
        return correct values
     3. Asserting the new rate-limit policy is registered
     4. Inserting a fake phone job with 5 items covering known cases:
        - obvious garbage (format_invalid expected)
        - well-formed mobile-style number (depends on Twilio creds)
     5. Calling processItem on each item directly (no worker needed)
     6. Verifying the verdicts match expectations
     7. Cleaning up: deletes the test job and items

   Run:
     node --env-file=.env scripts/verifyBatch07A.mjs

   Behavior with no Twilio credentials:
     The script DETECTS missing TWILIO_ACCOUNT_SID and skips the live
     lookup assertions, instead asserting that processItem correctly
     marks those items as error with code TWILIO_NO_CREDENTIALS. So
     the test still works in dev environments without Twilio set up.

   Pattern matches verifyBatch01-06.mjs: [OK]/[FAIL] prefixes, sections,
   summary, exit code 0|1.
   ═══════════════════════════════════════════════════════════════════════════ */

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

import {
  CREDIT_COSTS,
  bulkPhoneVerifyCost,
  bulkEmailVerifyCost,
  bulkCost,
  BULK_PHONE_MAX_ROWS,
} from '../app/utils/creditsConfig.server.js';

import {
  rateLimitKeys,
  rateLimitPolicies,
} from '../app/utils/rateLimit.server.js';

let passed = 0;
let failed = 0;

function ok(label)   { console.log(`  [OK]   ${label}`); passed++; }
function fail(label, detail) {
  console.log(`  [FAIL] ${label}${detail ? ` - ${detail}` : ''}`);
  failed++;
}
function eq(actual, expected, label) {
  if (actual === expected) ok(`${label} (${actual})`);
  else fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function truthy(value, label) {
  if (value) ok(label);
  else fail(label);
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Run: node --env-file=.env scripts/verifyBatch07A.mjs');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: true,
  onnotice: () => {},
});

// ─────────────────────────────────────────────────────────────────────────
// 1. Pricing helpers
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 1. creditsConfig: bulk phone helpers ---\n');

eq(CREDIT_COSTS.phone_verify_bulk_per_call, 2, 'CREDIT_COSTS.phone_verify_bulk_per_call');
eq(bulkPhoneVerifyCost(0), 0, 'bulkPhoneVerifyCost(0)');
eq(bulkPhoneVerifyCost(1), 2, 'bulkPhoneVerifyCost(1)');
eq(bulkPhoneVerifyCost(50), 100, 'bulkPhoneVerifyCost(50)');
eq(bulkPhoneVerifyCost(10000), 20000, 'bulkPhoneVerifyCost(10000) - matches BULK_PHONE_MAX cap');
eq(bulkPhoneVerifyCost(-5), 0, 'bulkPhoneVerifyCost(-5)');
eq(bulkPhoneVerifyCost(2.5), 0, 'bulkPhoneVerifyCost(2.5) non-integer');
eq(bulkPhoneVerifyCost('abc'), 0, 'bulkPhoneVerifyCost("abc")');

eq(BULK_PHONE_MAX_ROWS, 10000, 'BULK_PHONE_MAX_ROWS');

// ─────────────────────────────────────────────────────────────────────────
// 2. Generic bulkCost dispatcher
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. bulkCost dispatcher ---\n');

eq(bulkCost('email', 5),    bulkEmailVerifyCost(5),    'bulkCost("email", 5) matches bulkEmailVerifyCost');
eq(bulkCost('email', 50),   bulkEmailVerifyCost(50),   'bulkCost("email", 50)');
eq(bulkCost('phone', 50),   bulkPhoneVerifyCost(50),   'bulkCost("phone", 50) matches bulkPhoneVerifyCost');
eq(bulkCost('phone', 1000), 2000,                       'bulkCost("phone", 1000) = 2000 credits');

let threw = false;
try { bulkCost('sms', 10); } catch { threw = true; }
truthy(threw, 'bulkCost("sms", 10) throws on unknown type');

// ─────────────────────────────────────────────────────────────────────────
// 3. Rate limit policy registered
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. rateLimit: phone bulk policy ---\n');

const policy = rateLimitPolicies.phoneVerifyBulkStartByUser;
truthy(policy, 'rateLimitPolicies.phoneVerifyBulkStartByUser exists');
if (policy) {
  eq(policy.windowMinutes, 60, '  windowMinutes');
  eq(policy.maxAttempts, 10, '  maxAttempts');
}

const sampleKey = rateLimitKeys.phoneVerifyBulkStartByUser('user-abc');
eq(sampleKey, 'phoneverify:bulk_start:user:user-abc', 'rateLimitKeys.phoneVerifyBulkStartByUser format');

// ─────────────────────────────────────────────────────────────────────────
// 4. Migration: subcategory CHECK accepts phone values
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Migration: vji_subcategory_valid accepts phone values ---\n');

// We probe the constraint by inserting and rolling back. Need a real job +
// item parent because of the FK + NOT NULL columns. Easiest: synthesize
// minimal rows in a savepoint, then roll back.

let constraintAcceptsPhoneValues = false;
let testUserId = null;

try {
  // Check that there's at least one user we can attach a test job to.
  // (This script does not create users; it borrows.)
  const [anyUser] = await sql`
    SELECT id FROM users WHERE deleted_at IS NULL LIMIT 1
  `;
  if (!anyUser) {
    console.log('  [SKIP] no users in DB - cannot test constraint via real INSERT');
  } else {
    testUserId = anyUser.id;
    await sql.begin(async (tx) => {
      const [job] = await tx`
        INSERT INTO verification_jobs (user_id, type, total_rows, expires_at)
        VALUES (${testUserId}, 'phone', 1, now() + interval '1 hour')
        RETURNING id
      `;
      await tx`
        INSERT INTO verification_job_items (job_id, row_index, input, status, category, subcategory)
        VALUES (${job.id}, 0, '+15551234567', 'done', 'valid', 'mobile')
      `;
      await tx`
        INSERT INTO verification_job_items (job_id, row_index, input, status, category, subcategory)
        VALUES (${job.id}, 1, 'garbage', 'done', 'invalid', 'format_invalid')
      `;
      await tx`
        INSERT INTO verification_job_items (job_id, row_index, input, status, category, subcategory)
        VALUES (${job.id}, 2, '+18005551234', 'done', 'risky', 'landline')
      `;
      await tx`
        INSERT INTO verification_job_items (job_id, row_index, input, status, category, subcategory)
        VALUES (${job.id}, 3, '+15555550000', 'done', 'risky', 'voip')
      `;
      await tx`
        INSERT INTO verification_job_items (job_id, row_index, input, status, category, subcategory)
        VALUES (${job.id}, 4, '+19999999999', 'done', 'invalid', 'unreachable')
      `;
      await tx`
        INSERT INTO verification_job_items (job_id, row_index, input, status, category, subcategory)
        VALUES (${job.id}, 5, '+15551239876', 'done', 'unknown', 'lookup_failed')
      `;
      // All six new phone subcategories accepted - rollback the test rows
      // so we leave the database clean.
      throw new Error('__verify_batch07a_rollback__');
    }).catch((e) => {
      if (e.message === '__verify_batch07a_rollback__') {
        constraintAcceptsPhoneValues = true;
      } else {
        throw e;
      }
    });
  }
} catch (e) {
  fail('subcategory constraint accepts phone values', e.message);
}

if (testUserId) {
  truthy(constraintAcceptsPhoneValues, 'vji_subcategory_valid accepts: mobile, landline, voip, unreachable, format_invalid, lookup_failed');
}

// ─────────────────────────────────────────────────────────────────────────
// 5. End-to-end: enqueue a real job, run processItem, verify verdicts
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. End-to-end: enqueue + processItem + verdicts ---\n');

const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
console.log(`  Twilio credentials: ${hasTwilio ? 'present' : 'MISSING (live lookup assertions will be relaxed)'}`);

let jobId = null;
try {
  if (!testUserId) {
    console.log('  [SKIP] no users in DB');
  } else {
    // Create a real job with three test items. Cleanup at the end.
    const [job] = await sql`
      INSERT INTO verification_jobs (user_id, type, total_rows, expires_at, metadata)
      VALUES (
        ${testUserId},
        'phone',
        3,
        now() + interval '1 hour',
        ${sql.json({ source: 'verifyBatch07A', country: 'US' })}
      )
      RETURNING id
    `;
    jobId = job.id;

    // Three items: one obvious garbage, two well-formed (live Twilio if creds present).
    const items = await sql`
      INSERT INTO verification_job_items (job_id, row_index, input)
      VALUES
        (${jobId}, 0, 'this-is-not-a-phone'),
        (${jobId}, 1, '+15551234567'),
        (${jobId}, 2, 'not-a-number-either')
      RETURNING id, job_id AS "jobId", row_index AS "rowIndex", input, attempts
    `;

    // Mock the user_id and jobMetadata fields the way claimItems would
    // populate them, so processItem sees the same shape it gets from
    // a real claim.
    const enriched = items.map((i) => ({
      ...i,
      userId: testUserId,
      jobMetadata: { source: 'verifyBatch07A', country: 'US' },
      attempts: 1,  // matches post-claim state
    }));

    // We need to mark items as 'processing' and bump attempts to mirror
    // claimItems' side effect. The processor uses item.attempts to decide
    // retry vs error.
    for (const item of enriched) {
      await sql`
        UPDATE verification_job_items
        SET status = 'processing', claimed_at = now(), attempts = 1
        WHERE id = ${item.id}
      `;
    }

    const { processItem } = await import('../worker/phoneProcessor.js');

    // Run the processor on each item.
    for (const item of enriched) {
      await processItem(item);
    }

    // Read back results.
    const finals = await sql`
      SELECT row_index AS "rowIndex", status, category, subcategory, error_code AS "errorCode"
      FROM verification_job_items
      WHERE job_id = ${jobId}
      ORDER BY row_index
    `;

    // Item 0: garbage input -> format_invalid (no Twilio call).
    eq(finals[0].status,      'done',           'item 0 status');
    eq(finals[0].category,    'invalid',        'item 0 category');
    eq(finals[0].subcategory, 'format_invalid', 'item 0 subcategory');

    // Item 1: well-formed mobile-pattern number. Behavior depends on Twilio.
    //   With creds: Twilio responds (success or NOT_FOUND for fictional 555-1234)
    //   Without creds: marked error with TWILIO_NO_CREDENTIALS
    if (hasTwilio) {
      truthy(
        ['done', 'error'].includes(finals[1].status),
        `item 1 status (with Twilio creds, got ${finals[1].status})`,
      );
    } else {
      eq(finals[1].status,    'error',                  'item 1 status (no Twilio creds)');
      eq(finals[1].errorCode, 'TWILIO_NO_CREDENTIALS',  'item 1 errorCode');
    }

    // Item 2: garbage input -> format_invalid.
    eq(finals[2].status,      'done',           'item 2 status');
    eq(finals[2].category,    'invalid',        'item 2 category');
    eq(finals[2].subcategory, 'format_invalid', 'item 2 subcategory');

    // Cleanup.
    await sql`DELETE FROM verification_jobs WHERE id = ${jobId}`;
    jobId = null;
    ok('cleanup: test job deleted');
  }
} catch (err) {
  fail('end-to-end processItem flow', err.message);
  if (jobId) {
    try {
      await sql`DELETE FROM verification_jobs WHERE id = ${jobId}`;
      console.log('  [CLEANUP] best-effort delete attempted');
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────
console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);

await sql.end();
process.exit(failed > 0 ? 1 : 0);
