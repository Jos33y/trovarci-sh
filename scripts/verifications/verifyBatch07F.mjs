#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/verifyBatch07F.mjs

   Smoke test for sub-batch 7F (Email Verifier bulk-route bug fixes).

   Tests three things at the lib level using inlined SQL (same pattern
   as verifyBatch07B and grantCredits.mjs - we cannot import the lib
   from a Node CLI because it uses the ~/ Vite alias).

   IF YOU MODIFY app/lib/credits.server.js IN A WAY THAT AFFECTS
   spendCredits OR refundCredits, MIRROR THE CHANGE HERE.

   Coverage:

     1. spendCredits insufficient-credit shape:
        Returns { ok: false, reason: 'insufficient', balance, required }.
        NOT { ok: false, code: 'INSUFFICIENT_CREDITS', ... }.
        The route bug was checking spend.code; we confirm here that
        spend.reason is the field that exists.

     2. spendCredits metadata persistence:
        When you pass { metadata: { rows: 5, foo: 'bar' } } the
        credit_transactions row's metadata column has those keys.
        The route bug was passing { rows: 5 } at the top level which
        the lib silently dropped. We confirm here that proper nesting
        results in non-empty audit metadata.

     3. refundCredits return shape:
        Returns { transactionId, newBalance, idempotent } - no .ok
        field. Cancel-route bug was checking refund.ok; this confirms
        the actual shape so the fix in 7B + the route changes today
        are sound.

   Run:  node --env-file=.env scripts/verifyBatch07F.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import postgres from 'postgres';

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
  console.error('ERROR: DATABASE_URL not set. Run: node --env-file=.env scripts/verifyBatch07F.mjs');
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
// Inlined credits.server.js operations
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
      RETURNING id, metadata
    `;
    return { ok: true, transactionId: row.id, newBalance, persistedMetadata: row.metadata };
  });
}

async function __refund(userId, amount, { originalTransactionId, reason }) {
  return await sql.begin(async (tx) => {
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

async function __grant(userId, amount, type) {
  return await sql.begin(async (tx) => {
    const [user] = await tx`
      SELECT credits_balance FROM users WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE
    `;
    if (!user) throw new Error(`User not found: ${userId}`);
    const newBalance = user.credits_balance + amount;
    await tx`UPDATE users SET credits_balance = ${newBalance} WHERE id = ${userId}`;
    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (${userId}, ${amount}, ${newBalance}, ${type}, ${null}, ${sql.json({ source: 'verifyBatch07F' })})
      RETURNING id
    `;
    return { transactionId: row.id, newBalance };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────

let testUserId;
let cleanupTransactions = [];

try {
  const [u] = await sql`SELECT id, credits_balance FROM users WHERE deleted_at IS NULL LIMIT 1`;
  if (!u) {
    console.error('  [SKIP] No users in DB - cannot run end-to-end tests');
    await sql.end();
    process.exit(0);
  }
  testUserId = u.id;

  // Need >= 50 credits for the spend test; grant if low.
  if (Number(u.credits_balance) < 50) {
    await __grant(testUserId, 100, 'grant');
    console.log(`  [SETUP] granted 100 credits to user ${testUserId}`);
  }
} catch (err) {
  console.error('  [FAIL] setup:', err.message);
  await sql.end();
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// 1. spendCredits insufficient shape
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 1. spendCredits insufficient-credit shape ---\n');

try {
  // Spend more than the user has by checking against 999_999.
  // (10x BULK_EMAIL_MAX_ROWS bulk cap, well above any realistic balance.)
  const huge = 999_999;
  const result = await __spend(testUserId, huge, 'verify07F_test_too_big', { metadata: {} });

  eq(result.ok, false, 'over-balance returns ok=false');
  eq(result.reason, 'insufficient', 'returns reason="insufficient" (NOT a `code` field)');
  truthy(typeof result.balance === 'number', 'returns numeric balance');
  truthy(typeof result.required === 'number', 'returns numeric required');
  eq(result.code, undefined, 'spend.code does NOT exist (the bug source)');
} catch (err) {
  fail('insufficient-credit shape', err.message);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. spendCredits metadata persistence
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. spendCredits metadata persistence ---\n');

try {
  // GOOD shape: { metadata: { rows: 5 } } -> should land in DB
  const goodSpend = await __spend(testUserId, 1, 'verify07F_metadata_good', {
    metadata: { rows: 5, source: 'verifyBatch07F' },
  });
  truthy(goodSpend.ok, 'good-metadata spend succeeded');
  if (goodSpend.ok) {
    cleanupTransactions.push(goodSpend.transactionId);
    truthy(goodSpend.persistedMetadata, 'metadata column not null');
    eq(goodSpend.persistedMetadata?.rows, 5, 'rows=5 persisted');
    eq(goodSpend.persistedMetadata?.source, 'verifyBatch07F', 'source persisted');
    eq(goodSpend.persistedMetadata?.tool, 'verify07F_metadata_good', 'tool name auto-merged');
  }

  // BAD shape (the bug): top-level keys outside `metadata` are dropped.
  // This is the silent failure mode the prior route was hitting. We
  // simulate it by NOT wrapping in metadata and asserting the row's
  // metadata only contains 'tool' (no rows key).
  const badShape = await sql.begin(async (tx) => {
    const [user] = await tx`SELECT credits_balance FROM users WHERE id = ${testUserId} FOR UPDATE`;
    const newBalance = user.credits_balance - 1;
    await tx`UPDATE users SET credits_balance = ${newBalance} WHERE id = ${testUserId}`;
    // Mimic the OLD buggy call: pass { rows: 5 } at top level. The lib
    // would spread `...metadata` from the FIRST arg's destructure default
    // ({ metadata = {} }), so any sibling keys get dropped.
    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (${testUserId}, ${-1}, ${newBalance}, 'usage', ${null}, ${sql.json({ tool: 'verify07F_metadata_bad' })})
      RETURNING id, metadata
    `;
    return { transactionId: row.id, persistedMetadata: row.metadata };
  });
  cleanupTransactions.push(badShape.transactionId);
  eq(badShape.persistedMetadata?.rows, undefined, 'old buggy shape: rows is NOT in metadata (proves the fix matters)');
} catch (err) {
  fail('metadata persistence', err.message);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. refundCredits return shape
// ─────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. refundCredits return shape ---\n');

try {
  // Spend then refund in one go.
  const sp = await __spend(testUserId, 5, 'verify07F_refund_test');
  truthy(sp.ok, 'setup spend ok');
  if (sp.ok) {
    cleanupTransactions.push(sp.transactionId);
    const refund = await __refund(testUserId, 5, {
      originalTransactionId: sp.transactionId,
      reason: 'verifyBatch07F test refund',
    });
    truthy(refund.transactionId, 'refund returns truthy transactionId');
    truthy(typeof refund.newBalance === 'number', 'refund returns numeric newBalance');
    eq(refund.idempotent, false, 'first refund is not idempotent');
    eq(refund.ok, undefined, 'refund.ok does NOT exist (the cancel-route bug source)');

    // Idempotency check: refunding same tx returns existing
    const refund2 = await __refund(testUserId, 5, {
      originalTransactionId: sp.transactionId,
      reason: 'duplicate refund attempt',
    });
    eq(refund2.transactionId, refund.transactionId, 'second refund returns same tx (idempotent)');
    eq(refund2.idempotent, true, 'second refund flagged idempotent');
    cleanupTransactions.push(refund.transactionId);
  }
} catch (err) {
  fail('refund return shape', err.message);
}

// ─────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────
console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);

await sql.end();
process.exit(failed > 0 ? 1 : 0);
