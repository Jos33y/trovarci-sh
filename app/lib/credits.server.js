/**
 * Credit system - core business logic.
 *
 * Every credit change funnels through this module. Direct UPDATEs to
 * users.credits_balance from anywhere else is a bug - the ledger will drift.
 *
 * Atomicity model:
 *   - SELECT users.credits_balance FOR UPDATE inside a transaction. Row-level
 *     lock prevents concurrent double-spends (two simultaneous tool runs from
 *     the same user can't both pass the balance check with stale data).
 *   - UPDATE credits_balance, then INSERT ledger row with balance_after set to
 *     the NEW value.
 *   - Transaction commits atomically; partial failures roll back both.
 *
 * Idempotency (grants/refunds only):
 *   - When referenceId is provided, grantCredits and refundCredits check for
 *     a prior transaction with the same (user_id, type, reference_id). If
 *     found, returns the existing row instead of double-crediting.
 *   - The check is two-layered:
 *       1. Optimistic SELECT inside the tx (catches the common case).
 *       2. Catch 23505 unique_violation from the partial unique index
 *          ct_idempotent_grant (catches the race where two concurrent
 *          webhook deliveries both pass the SELECT and both try to INSERT).
 *     Without layer 2, a webhook retry that races itself can double-credit.
 *   - spendCredits does NOT use reference_id for idempotency because usage is
 *     per-call, not per-entity.
 */

import { sql } from '../utils/db.server.js';

// ============================================================================
// Internal helpers
// ============================================================================

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${value}`);
  }
}

// SQLSTATE 23505 - unique_violation. Raised by the partial unique index
// ct_idempotent_grant when a concurrent grant for (user_id, type, reference_id)
// already committed.
const UNIQUE_VIOLATION = '23505';

// ============================================================================
// spendCredits
// ============================================================================

/**
 * Atomically deduct credits from a user's balance and write a 'usage' ledger
 * row. Caller is responsible for the actual work (API call, computation) -
 * this function only handles the accounting.
 *
 * Pattern:
 *   const result = await spendCredits(userId, cost, 'email_verify', { metadata: {...} });
 *   if (!result.ok) return { error: 'insufficient_credits' };
 *   try {
 *     await doTheWork();
 *   } catch (err) {
 *     await refundCredits(userId, cost, { originalTransactionId: result.transactionId, reason: 'tool_failed' });
 *     throw err;
 *   }
 *
 * @returns {Promise<
 *   | { ok: true, transactionId: string, newBalance: number }
 *   | { ok: false, reason: 'insufficient', balance: number, required: number }
 * >}
 */
export async function spendCredits(userId, amount, toolName, { referenceId = null, metadata = {} } = {}) {
  assertPositiveInt(amount, 'amount');
  if (typeof toolName !== 'string' || !toolName) {
    throw new Error('toolName is required');
  }

  return await sql.begin(async (tx) => {
    const [user] = await tx`
      SELECT credits_balance
      FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
      FOR UPDATE
    `;

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (user.credits_balance < amount) {
      return {
        ok: false,
        reason: 'insufficient',
        balance: user.credits_balance,
        required: amount,
      };
    }

    const newBalance = user.credits_balance - amount;

    await tx`
      UPDATE users
      SET credits_balance = ${newBalance}
      WHERE id = ${userId}
    `;

    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (${userId}, ${-amount}, ${newBalance}, 'usage', ${referenceId}, ${sql.json({ tool: toolName, ...metadata })})
      RETURNING id
    `;

    return { ok: true, transactionId: row.id, newBalance };
  });
}

// ============================================================================
// grantCredits
// ============================================================================

/**
 * Add credits to a user's balance. Used for welcome bonuses, payment success,
 * promotional grants, and admin adjustments with positive delta.
 *
 * Idempotency: when referenceId is provided, a prior grant with the same
 * (user, type, reference_id) returns the existing transaction instead of
 * double-crediting. Essential for payment webhook replay safety.
 *
 * @param type - One of: 'purchase', 'grant', 'refund', 'adjustment'
 * @returns {Promise<{ transactionId: string, newBalance: number, idempotent: boolean }>}
 */
export async function grantCredits(userId, amount, type, { referenceId = null, metadata = {} } = {}) {
  assertPositiveInt(amount, 'amount');
  if (!['purchase', 'grant', 'refund', 'adjustment'].includes(type)) {
    throw new Error(`Invalid grant type: ${type}`);
  }

  try {
    return await sql.begin(async (tx) => {
      // Optimistic idempotency check inside the tx. Catches the common case
      // (sequential retry after the first commit completed). The 23505 catch
      // below covers the race window between this SELECT and the INSERT.
      if (referenceId) {
        const [existing] = await tx`
          SELECT id, balance_after
          FROM credit_transactions
          WHERE user_id = ${userId}
            AND type = ${type}
            AND reference_id = ${referenceId}
          LIMIT 1
        `;
        if (existing) {
          return {
            transactionId: existing.id,
            newBalance: existing.balance_after,
            idempotent: true,
          };
        }
      }

      const [user] = await tx`
        SELECT credits_balance
        FROM users
        WHERE id = ${userId} AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const newBalance = user.credits_balance + amount;

      await tx`
        UPDATE users
        SET credits_balance = ${newBalance}
        WHERE id = ${userId}
      `;

      const [row] = await tx`
        INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
        VALUES (${userId}, ${amount}, ${newBalance}, ${type}, ${referenceId}, ${sql.json(metadata)})
        RETURNING id
      `;

      return { transactionId: row.id, newBalance, idempotent: false };
    });
  } catch (err) {
    // Concurrent webhook race: a sibling tx beat us to the INSERT and the
    // partial unique index (ct_idempotent_grant) rejected ours. The whole tx
    // is rolled back including the user balance UPDATE - exactly what we
    // want, since the winning tx already applied that delta. Re-fetch the
    // winner and return it as idempotent.
    if (err && err.code === UNIQUE_VIOLATION && referenceId) {
      const [existing] = await sql`
        SELECT id, balance_after
        FROM credit_transactions
        WHERE user_id = ${userId}
          AND type = ${type}
          AND reference_id = ${referenceId}
        LIMIT 1
      `;
      if (existing) {
        return {
          transactionId: existing.id,
          newBalance: existing.balance_after,
          idempotent: true,
        };
      }
      // Fall through if the winning row vanished (shouldn't happen; ledger is
      // append-only). Re-throwing surfaces the original 23505 to the caller.
    }
    throw err;
  }
}

// ============================================================================
// refundCredits
// ============================================================================

/**
 * Refund a previous usage transaction. Writes a 'refund' ledger row with
 * reference_id pointing to the original transaction for audit trail.
 *
 * Idempotent: refunding the same original transaction twice returns the
 * existing refund instead of double-crediting.
 *
 * @param originalTransactionId - UUID of the 'usage' transaction being refunded.
 */
export async function refundCredits(userId, amount, { originalTransactionId, reason = null, metadata = {} } = {}) {
  assertPositiveInt(amount, 'amount');
  if (!originalTransactionId) {
    throw new Error('originalTransactionId is required');
  }

  return grantCredits(userId, amount, 'refund', {
    referenceId: originalTransactionId,
    metadata: reason ? { reason, ...metadata } : metadata,
  });
}

// ============================================================================
// Read helpers (for dashboard)
// ============================================================================

/**
 * Returns dashboard stats derived from the ledger.
 * All queries are single-pass over ct_user_created index.
 */
export async function getCreditSummary(userId) {
  const [row] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'usage'                     THEN -delta ELSE 0 END), 0)::int AS spent_30d,
      COALESCE(SUM(CASE WHEN type = 'purchase'                  THEN  delta ELSE 0 END), 0)::int AS purchased_30d,
      COALESCE(SUM(CASE WHEN type = 'usage'                     THEN  1     ELSE 0 END), 0)::int AS usage_count_30d
    FROM credit_transactions
    WHERE user_id = ${userId}
      AND created_at > now() - interval '30 days'
  `;

  // Per-tool breakdown for usage (metadata.tool).
  const byTool = await sql`
    SELECT
      metadata->>'tool' AS tool,
      SUM(-delta)::int  AS spent
    FROM credit_transactions
    WHERE user_id = ${userId}
      AND type = 'usage'
      AND created_at > now() - interval '30 days'
      AND metadata ? 'tool'
    GROUP BY metadata->>'tool'
    ORDER BY spent DESC
  `;

  return {
    spent30d: row.spent_30d,
    purchased30d: row.purchased_30d,
    usageCount30d: row.usage_count_30d,
    byTool: byTool.map((r) => ({ tool: r.tool, spent: r.spent })),
  };
}

/**
 * Paginated transaction list for the dashboard transactions tab.
 * Supports filtering by type ('purchase' | 'usage' | null for all) and
 * method (derived from metadata for purchases).
 */
export async function listTransactions(userId, { type = null, search = null, limit = 10, offset = 0 } = {}) {
  const typeFilter = type === 'purchase'
    ? sql`AND type IN ('purchase', 'refund', 'grant')`
    : type === 'usage'
    ? sql`AND type = 'usage'`
    : sql``;

  const searchFilter = search
    ? sql`AND (metadata::text ILIKE ${'%' + search + '%'})`
    : sql``;

  const rows = await sql`
    SELECT id, delta, balance_after, type, reference_id, metadata, created_at
    FROM credit_transactions
    WHERE user_id = ${userId}
      ${typeFilter}
      ${searchFilter}
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const [count] = await sql`
    SELECT COUNT(*)::int AS total
    FROM credit_transactions
    WHERE user_id = ${userId}
      ${typeFilter}
      ${searchFilter}
  `;

  return { rows, total: count.total };
}

/**
 * Current credit balance for a user. Reads users.credits_balance directly -
 * the canonical source maintained atomically by spend/grant/refund.
 */
export async function getCreditBalance(userId) {
  const [user] = await sql`
    SELECT credits_balance
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `;
  return user ? user.credits_balance : 0;
}