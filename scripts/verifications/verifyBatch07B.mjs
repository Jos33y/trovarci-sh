#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/verifyBatch07B.mjs

   Smoke test for Bulk Number Verifier sub-batch 7B (route + cancel).

   Tests the LIB and DISPATCHER contracts that the new HTTP route relies
   on. Does NOT exercise the HTTP layer directly (that's a manual/curl
   /UI test in the install script's checklist).

   ─── DESIGN NOTE: same alias workaround as scripts/grantCredits.mjs ───
   credits.server.js imports `~/utils/db.server` which only resolves under
   Vite. We cannot import it from this standalone Node CLI. Instead we
   replicate spendCredits and refundCredits inline as `__spend` and
   `__refund` using a direct postgres connection. The SQL is byte-for-byte
   the same as the lib (FOR UPDATE row lock, append-only ledger, atomic
   transaction), so this script tests the SAME contract the route will
   exercise at runtime.

   IF YOU MODIFY app/lib/credits.server.js IN A WAY THAT AFFECTS
   spendCredits OR refundCredits, MIRROR THE CHANGE HERE.

   creditsConfig.server.js and jobQueue.server.js do NOT use the alias
   (relative imports only) so we DO import them directly - those calls
   are testing the real production code paths.

   Coverage:
     1. bulkCost dispatcher matches per-type semantics
     2. cancelJob returns type field (the surgical lib change)
     3. End-to-end: spend, partially process, cancel, refund, verify math

   Run:  node --env-file=.env scripts/verifyBatch07B.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import postgres from 'postgres';

import {
  bulkCost,
  bulkEmailVerifyCost,
  bulkPhoneVerifyCost,
} from '../app/utils/creditsConfig.server.js';

// jobQueue.server.js uses relative imports only - safe to load from Node.
import { cancelJob } from '../app/lib/jobQueue.server.js';

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
  console.error('ERROR: DATABASE_URL not set. Run: node --env-file=.env scripts/verifyBatch07B.mjs');
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
// Inline spend/refund - mirror app/lib/credits.server.js exactly.
// We avoid importing the lib because it uses the ~/ alias.
// ─────────────────────────────────────────────────────────────────────────
async function __spend(userId, amount, toolName, { metadata = {} } = {}) {
  return await sql.begin(async (tx) => {
    const [user] = await tx`
      SELECT credits_balance FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!user) throw new Error(`User not found: ${userId}`);
    if (user.credits_balance < amount) {
      return { ok: false, reason: 'insufficient', balance: user.credits_balance, required: amount };
    }
    const newBalance = user.credits_balance - amount;
    await tx`UPDATE users SET credits_balance = ${newBalance} WHERE id = ${userId}`;
    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (${userId}, ${-amount}, ${newBalance}, 'usage', ${null}, ${sql.json({ tool: toolName, ...metadata })})
      RETURNING id
    `;
    return { ok: true, transactionId: row.id, newBalance };
  });
}

async function __refund(userId, amount, { originalTransactionId, reason }) {
  return await sql.begin(async (tx) => {
    // Idempotency check (same as lib).
    const [existing] = await tx`
      SELECT id, balance_after FROM credit_transactions
      WHERE user_id = ${userId} AND type = 'refund' AND reference_id = ${originalTransactionId}
      LIMIT 1
    `;
    if (existing) {
      return { transactionId: existing.id, newBalance: Number(existing.balance_after), idempotent: true };
    }
    const [user] = await tx`
      SELECT credits_balance FROM users WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
    `;
    if (!user) throw new Error(`User not found: ${userId}`);
    const newBalance = user.credits_balance + amount;
    await tx`UPDATE users SET credits_balance = ${newBalance} WHERE id = ${userId}`;
    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (${userId}, ${amount}, ${newBalance}, 'refund', ${originalTransactionId}, ${sql.json({ reason })})
      RETURNING id
    `;
    return { transactionId: row.id, newBalance, idempotent: false };
  });
}

async function __grant(userId, amount, type, { metadata = {} } = {}) {
  return await sql.begin(async (tx) => {
    const [user] = await tx`
      SELECT credits_balance FROM users WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
    `;
    if (!user) throw new Error(`User not found: ${userId}`);
    const newBalance = user.credits_balance + amount;
    await tx`UPDATE users SET credits_balance = ${newBalance} WHERE id = ${userId}`;
    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (${userId}, ${amount}, ${newBalance}, ${type}, ${null}, ${sql.json(metadata)})
      RETURNING id
    `;
    return { transactionId: row.id, newBalance };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Cleanup tracker
// ─────────────────────────────────────────────────────────────────────────
const jobsToClean = [];
async function cleanup() {
  if (jobsToClean.length === 0) return;
  try {
    await sql`DELETE FROM verification_jobs WHERE id = ANY(${jobsToClean})`;
    console.log(`  [CLEANUP] removed ${jobsToClean.length} test job(s)`);
  } catch (err) {
    console.error(`  [CLEANUP] failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. bulkCost dispatcher
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 1. bulkCost dispatcher consistency ---\n');

for (const n of [0, 1, 5, 6, 100, 5000]) {
  eq(bulkCost('email', n), bulkEmailVerifyCost(n), `bulkCost('email', ${n})`);
}
for (const n of [0, 1, 50, 500, 10000]) {
  eq(bulkCost('phone', n), bulkPhoneVerifyCost(n), `bulkCost('phone', ${n})`);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. cancelJob returns type
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. cancelJob returns type field ---\n');

let testUserId;
try {
  const [u] = await sql`SELECT id, credits_balance FROM users WHERE deleted_at IS NULL LIMIT 1`;
  if (!u) {
    console.log('  [SKIP] no users in DB');
  } else {
    testUserId = u.id;
    const initialBalance = Number(u.credits_balance);
    if (initialBalance < 100) {
      await __grant(testUserId, 200, 'grant', {
        metadata: { source: 'verifyBatch07B', reason: 'test float' },
      });
      console.log(`  [SETUP] granted 200 test credits to user ${testUserId}`);
    }

    // Phone job
    const [phoneJob] = await sql`
      INSERT INTO verification_jobs (user_id, type, total_rows, expires_at)
      VALUES (${testUserId}, 'phone', 1, now() + interval '1 hour')
      RETURNING id
    `;
    jobsToClean.push(phoneJob.id);
    await sql`
      INSERT INTO verification_job_items (job_id, row_index, input)
      VALUES (${phoneJob.id}, 0, '+15551234567')
    `;
    const phoneCancel = await cancelJob(phoneJob.id, testUserId);
    truthy(phoneCancel.ok, 'phone cancelJob returned ok=true');
    eq(phoneCancel.type, 'phone', 'phone cancelJob returns type');

    // Email job
    const [emailJob] = await sql`
      INSERT INTO verification_jobs (user_id, type, total_rows, expires_at)
      VALUES (${testUserId}, 'email', 1, now() + interval '1 hour')
      RETURNING id
    `;
    jobsToClean.push(emailJob.id);
    await sql`
      INSERT INTO verification_job_items (job_id, row_index, input)
      VALUES (${emailJob.id}, 0, 'a@example.com')
    `;
    const emailCancel = await cancelJob(emailJob.id, testUserId);
    truthy(emailCancel.ok, 'email cancelJob returned ok=true');
    eq(emailCancel.type, 'email', 'email cancelJob returns type');
  }
} catch (err) {
  fail('cancelJob type field test', err.message);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Cancel + refund math
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Cancel-refund math by type ---\n');

if (testUserId) {
  try {
    const cost = bulkPhoneVerifyCost(10);  // 20
    eq(cost, 20, 'phone bulk cost for 10 numbers');

    const spend = await __spend(testUserId, cost, 'phone_verify_bulk_hold', {
      metadata: { source: 'verifyBatch07B', rows: 10 },
    });
    truthy(spend.ok, 'spendCredits succeeded');

    if (spend.ok) {
      const [job] = await sql`
        INSERT INTO verification_jobs (
          user_id, type, total_rows, credits_held, hold_transaction_id, expires_at
        )
        VALUES (
          ${testUserId}, 'phone', 10, ${cost}, ${spend.transactionId},
          now() + interval '1 hour'
        )
        RETURNING id
      `;
      jobsToClean.push(job.id);

      const itemRows = Array.from({ length: 10 }, (_, i) => ({
        job_id: job.id, row_index: i, input: `+1555000${String(i).padStart(4, '0')}`,
      }));
      await sql`
        INSERT INTO verification_job_items ${sql(itemRows, 'job_id', 'row_index', 'input')}
      `;
      // Mark 4 as 'done' valid/mobile so processed_done = 4 on cancel.
      await sql`
        UPDATE verification_job_items
        SET status = 'done', category = 'valid', subcategory = 'mobile', processed_at = now()
        WHERE job_id = ${job.id} AND row_index < 4
      `;

      const cancelResult = await cancelJob(job.id, testUserId);
      truthy(cancelResult.ok, 'cancelJob returned ok=true');
      eq(cancelResult.creditsHeld, 20, 'creditsHeld matches what we paid');
      eq(cancelResult.processedRows, 4, 'processedRows = 4');
      eq(cancelResult.type, 'phone', 'cancelResult.type = phone');

      const expectedKept   = bulkCost('phone', 4);  // 8
      const expectedRefund = cancelResult.creditsHeld - expectedKept;
      eq(expectedKept, 8, 'expected creditsKept (4 * 2)');
      eq(expectedRefund, 12, 'expected refund (20 - 8)');

      // Apply the refund the same way the route does.
      const refund = await __refund(testUserId, expectedRefund, {
        originalTransactionId: spend.transactionId,
        reason: 'verifyBatch07B test cancel',
      });
      truthy(refund.transactionId, 'refundCredits returned a transactionId');
      truthy(typeof refund.newBalance === 'number', 'refundCredits returned newBalance');
      ok(`refund landed: balance now ${refund.newBalance}`);
    }
  } catch (err) {
    fail('cancel-refund math', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Summary + cleanup
// ─────────────────────────────────────────────────────────────────────────
await cleanup();

console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);

await sql.end();
process.exit(failed > 0 ? 1 : 0);
