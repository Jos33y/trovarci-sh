// Credit expiry worker logic. Finds grants past expires_at with unused remaining, deducts atomically per grant.

import { sql } from '../utils/db.server.js';

// Process up to BATCH_SIZE expired grants per tick. Keeps each transaction small;
// the loop runs daily so a backlog catches up within a few ticks if needed.
const BATCH_SIZE = 500;

/**
 * Find expired grants with unused remaining_amount and zero them out.
 * Each grant is handled in its own transaction so a problem on one
 * doesn't block the rest.
 *
 * @returns {Promise<{expired: number, totalCreditsExpired: number, errors: number}>}
 */
export async function expireCredits() {
  const candidates = await sql`
    SELECT id, user_id, remaining_amount, expires_at
    FROM credit_transactions
    WHERE expires_at IS NOT NULL
      AND expires_at <= now()
      AND remaining_amount > 0
    ORDER BY expires_at ASC
    LIMIT ${BATCH_SIZE}
  `;

  if (candidates.length === 0) {
    return { expired: 0, totalCreditsExpired: 0, errors: 0 };
  }

  let expired = 0;
  let totalCreditsExpired = 0;
  let errors = 0;

  for (const grant of candidates) {
    try {
      const result = await expireOneGrant(grant.id);
      if (result.expiredAmount > 0) {
        expired += 1;
        totalCreditsExpired += result.expiredAmount;
      }
    } catch (err) {
      errors += 1;
      console.error(`[creditExpiry] grant ${grant.id} failed:`, err?.message || err);
    }
  }

  return { expired, totalCreditsExpired, errors };
}

// Atomic single-grant expiry: lock grant, lock user, deduct balance, zero remaining, write adjustment row.
async function expireOneGrant(grantId) {
  return sql.begin(async (tx) => {
    // Re-read with lock; another worker or a concurrent spend may have already touched it.
    const [grant] = await tx`
      SELECT id, user_id, remaining_amount, expires_at
      FROM credit_transactions
      WHERE id = ${grantId}
      FOR UPDATE
    `;

    if (!grant || grant.remaining_amount <= 0 || grant.expires_at > new Date()) {
      return { expiredAmount: 0 };
    }

    const toExpire = grant.remaining_amount;

    const [user] = await tx`
      SELECT credits_balance
      FROM users
      WHERE id = ${grant.user_id}
      FOR UPDATE
    `;
    if (!user) return { expiredAmount: 0 };

    // Clamp at 0 - shouldn't go negative, but a corrupt ledger shouldn't cascade.
    const newBalance = Math.max(0, user.credits_balance - toExpire);
    const actualDeduction = user.credits_balance - newBalance;

    await tx`
      UPDATE users
      SET credits_balance = ${newBalance}
      WHERE id = ${grant.user_id}
    `;

    await tx`
      UPDATE credit_transactions
      SET remaining_amount = 0
      WHERE id = ${grant.id}
    `;

    await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (
        ${grant.user_id},
        ${-actualDeduction},
        ${newBalance},
        'adjustment',
        ${grant.id},
        ${sql.json({ reason: 'credit_expired', original_grant_id: grant.id })}
      )
    `;

    return { expiredAmount: actualDeduction };
  });
}
