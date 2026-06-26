/**
 * Payments library.
 *
 * Orchestration layer between gateway adapters, the payments table, and the
 * credits ledger. Keeps the webhook handler thin and the action handlers thin.
 *
 * The critical function here is `completePayment` - it atomically:
 *   1. Locks the payment row
 *   2. Checks for idempotency (already completed? return existing result)
 *   3. Grants credits via the credits module
 *   4. Updates the payment row to terminal state
 *
 * All in a single transaction so webhook replay is safe.
 */

import { sql } from '~/utils/db.server';
import { grantCredits } from '~/lib/credits.server';

// -----------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------

/**
 * Create a pending payment row. Returns the full row including its UUID,
 * which the caller uses as the gateway's order_id.
 */
export async function createPendingPayment({
  userId,
  gateway,
  packageKey,
  credits,
  amountUsdCents,
  metadata = {},
}) {
  const [row] = await sql`
    INSERT INTO payments (user_id, gateway, status, package_key, credits, amount_usd_cents, metadata)
    VALUES (${userId}, ${gateway}, 'pending', ${packageKey}, ${credits}, ${amountUsdCents}, ${sql.json(metadata)})
    RETURNING id, user_id, gateway, status, package_key, credits, amount_usd_cents, created_at
  `;
  return row;
}

// -----------------------------------------------------------------------
// Update to awaiting_payment
// -----------------------------------------------------------------------

/**
 * Called after the gateway returns a successful invoice creation. Stores the
 * gateway's reference (Cryptomus invoice uuid) and advances status.
 */
export async function markAwaitingPayment(paymentId, { gatewayReference, checkoutUrl }) {
  const [row] = await sql`
    UPDATE payments
    SET status = 'awaiting_payment',
        gateway_reference = ${gatewayReference},
        metadata = metadata || ${sql.json({ checkout_url: checkoutUrl })}
    WHERE id = ${paymentId}
      AND status = 'pending'
    RETURNING id, status, gateway_reference
  `;
  return row || null;
}

// -----------------------------------------------------------------------
// Mark failed (for gateway creation errors before awaiting_payment)
// -----------------------------------------------------------------------

export async function markPaymentFailed(paymentId, reason) {
  await sql`
    UPDATE payments
    SET status = 'failed',
        metadata = metadata || ${sql.json({ failure_reason: reason })}
    WHERE id = ${paymentId}
      AND status IN ('pending', 'awaiting_payment')
  `;
}

// -----------------------------------------------------------------------
// Complete payment (THE function that matters)
//
// Atomically:
//   1. Lock the payments row
//   2. Check if already terminal - return without doing anything (idempotent)
//   3. Grant credits (idempotent via reference_id in credit_transactions)
//   4. Update payment to 'confirmed' with completed_at
//
// Called from the webhook handler. Safe to call with the same payload twice.
// -----------------------------------------------------------------------

/**
 * Underpayment tolerance in cents. Crypto payments can be cents-short of
 * the invoice amount due to rate flutter at the moment of confirmation -
 * a $20 invoice paid in BTC might land at $19.97 if BTC dipped 0.15%
 * between invoice creation and finalisation. We accept up to this much
 * shortfall before treating it as a wrong_amount event.
 *
 * Override via env (CRYPTOMUS_UNDERPAYMENT_TOLERANCE_CENTS) if the default
 * causes false rejections in production. 50 cents = $0.50 of slack.
 *
 * Cryptomus's own status field already filters most underpayments - they
 * mark short payments as wrong_amount, which we map to 'failed' before
 * even reaching this check. This is defence-in-depth: catches the case
 * where Cryptomus ever sends 'paid' status with a shortfalled
 * payment_amount_usd (bug, hostile webhook surviving sig check, future
 * edge case we cannot predict).
 */
const UNDERPAYMENT_TOLERANCE_CENTS = (() => {
  const raw = process.env.CRYPTOMUS_UNDERPAYMENT_TOLERANCE_CENTS;
  if (!raw) return 50;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 50;
  return n;
})();

/**
 * @param {string} paymentId
 * @param {object} gatewayData - status-adjacent info to store in metadata
 * @param {string} [gatewayData.txid]
 * @param {string} [gatewayData.payerCurrency]
 * @param {string} [gatewayData.payerAmount]
 * @param {string} [gatewayData.paymentAmountUsd] - canonical USD value of
 *   what was actually paid (e.g. "19.97"). Cryptomus webhook field
 *   `payment_amount_usd`. Used for underpayment defence-in-depth.
 * @param {string} gatewayData.paymentMethodName - human-readable for UI ("Cryptomus", "Stripe")
 *
 * @returns {Promise<{
 *   alreadyCompleted: boolean,
 *   creditsGranted: number,
 *   newBalance: number,
 *   transactionId: string,
 *   userEmail?: string,
 *   userName?: string,
 *   underpaid?: boolean,
 *   shortfallCents?: number,
 * }>}
 */
export async function completePayment(paymentId, gatewayData = {}) {
  return await sql.begin(async (tx) => {
    const [payment] = await tx`
      SELECT id, user_id, status, package_key, credits, amount_usd_cents, gateway, metadata
      FROM payments
      WHERE id = ${paymentId}
      FOR UPDATE
    `;

    if (!payment) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    // Idempotency: if already confirmed, find the existing credit grant and
    // return its details. The credits module is also idempotent via
    // reference_id, so this is belt-and-suspenders.
    if (payment.status === 'confirmed') {
      const [existingGrant] = await tx`
        SELECT id, balance_after
        FROM credit_transactions
        WHERE user_id = ${payment.user_id}
          AND type = 'purchase'
          AND reference_id = ${payment.id}
        LIMIT 1
      `;
      return {
        alreadyCompleted: true,
        creditsGranted: payment.credits,
        newBalance: existingGrant?.balance_after ?? null,
        transactionId: existingGrant?.id ?? null,
      };
    }

    if (['failed', 'expired', 'refunded'].includes(payment.status)) {
      throw new Error(`Cannot complete payment in terminal state: ${payment.status}`);
    }

    // ─── Underpayment defence (P1-16) ──────────────────────────────
    // Compare actual paid USD against expected. paymentAmountUsd is a
    // string from the webhook (e.g. "19.97"). Convert to cents for
    // integer comparison. If the field is missing or unparseable, we
    // skip the check rather than reject - a malformed amount field is
    // not by itself proof of underpayment, and Cryptomus's own
    // wrong_amount status path already covered most cases upstream.
    if (gatewayData.paymentAmountUsd != null) {
      const paidCents = Math.round(parseFloat(gatewayData.paymentAmountUsd) * 100);
      if (Number.isFinite(paidCents) && paidCents > 0) {
        const shortfall = payment.amount_usd_cents - paidCents;
        if (shortfall > UNDERPAYMENT_TOLERANCE_CENTS) {
          // Mark the payment as failed with a wrong_amount reason. Do NOT
          // grant credits. Customer can contact support; admin can refund
          // their crypto via Cryptomus dashboard or grant the credits
          // manually if they want to honour the partial payment.
          await tx`
            UPDATE payments
            SET status = 'failed',
                metadata = metadata || ${tx.json({
                  failure_reason: 'underpayment',
                  expected_cents: payment.amount_usd_cents,
                  paid_cents: paidCents,
                  shortfall_cents: shortfall,
                  raw_webhook: gatewayData.rawWebhook || null,
                })}
            WHERE id = ${payment.id}
          `;
          // eslint-disable-next-line no-console
          console.warn(`[payments] underpayment rejected on ${payment.id}: expected ${payment.amount_usd_cents}c, paid ${paidCents}c (shortfall ${shortfall}c)`);
          return {
            alreadyCompleted: false,
            creditsGranted: 0,
            newBalance: null,
            transactionId: null,
            underpaid: true,
            shortfallCents: shortfall,
          };
        }
      }
    }

    // Grant credits. Uses grantCredits's idempotency via reference_id.
    const grantResult = await grantCreditsInTx(tx, {
      userId: payment.user_id,
      amount: payment.credits,
      referenceId: payment.id,
      metadata: {
        package_name: payment.package_key,
        payment_method: gatewayData.paymentMethodName || payment.gateway,
        amount_usd: (payment.amount_usd_cents / 100).toFixed(2),
        ...(gatewayData.txid ? { txid: gatewayData.txid } : {}),
        ...(gatewayData.payerCurrency ? { payer_currency: gatewayData.payerCurrency } : {}),
      },
    });

    await tx`
      UPDATE payments
      SET status = 'confirmed',
          completed_at = now(),
          payer_currency = ${gatewayData.payerCurrency ?? null},
          payer_amount = ${gatewayData.payerAmount ?? null},
          txid = ${gatewayData.txid ?? null},
          metadata = metadata || ${sql.json(gatewayData.rawWebhook ? { raw_webhook: gatewayData.rawWebhook } : {})}
      WHERE id = ${payment.id}
    `;

    return {
      alreadyCompleted: false,
      creditsGranted: payment.credits,
      newBalance: grantResult.newBalance,
      transactionId: grantResult.transactionId,
      userEmail: grantResult.userEmail,
      userName: grantResult.userName,
    };
  });
}

/**
 * Transaction-scoped version of grantCredits.
 *
 * We inline this rather than calling the version in credits.server.js because
 * that function starts its OWN transaction via sql.begin(). Running a
 * sub-transaction here would require SAVEPOINT juggling. Cleaner to replicate
 * the idempotency + row-lock logic with the tx already in scope.
 */
async function grantCreditsInTx(tx, { userId, amount, referenceId, metadata }) {
  // Idempotency check.
  const [existing] = await tx`
    SELECT id, balance_after
    FROM credit_transactions
    WHERE user_id = ${userId}
      AND type = 'purchase'
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

  const [user] = await tx`
    SELECT credits_balance, email, name
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    FOR UPDATE
  `;

  if (!user) {
    throw new Error(`User not found during payment completion: ${userId}`);
  }

  const newBalance = user.credits_balance + amount;

  await tx`
    UPDATE users
    SET credits_balance = ${newBalance}
    WHERE id = ${userId}
  `;

  const [row] = await tx`
    INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
    VALUES (${userId}, ${amount}, ${newBalance}, 'purchase', ${referenceId}, ${tx.json(metadata)})
    RETURNING id
  `;

  return { transactionId: row.id, newBalance, idempotent: false, userEmail: user.email, userName: user.name };
}

// -----------------------------------------------------------------------
// Mark expired / failed from webhook
// -----------------------------------------------------------------------

export async function markPaymentTerminal(paymentId, newStatus, { rawWebhook = null } = {}) {
  if (!['failed', 'expired'].includes(newStatus)) {
    throw new Error(`markPaymentTerminal only accepts failed|expired, got ${newStatus}`);
  }

  await sql`
    UPDATE payments
    SET status = ${newStatus},
        metadata = metadata || ${sql.json(rawWebhook ? { raw_webhook: rawWebhook } : {})}
    WHERE id = ${paymentId}
      AND status IN ('pending', 'awaiting_payment')
  `;
}

// -----------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------

export async function getPaymentForUser(paymentId, userId) {
  const [row] = await sql`
    SELECT id, gateway, gateway_reference, status, package_key, credits,
           amount_usd_cents, payer_currency, payer_amount, txid, metadata,
           created_at, updated_at, completed_at
    FROM payments
    WHERE id = ${paymentId} AND user_id = ${userId}
  `;
  return row || null;
}

export async function getPaymentById(paymentId) {
  const [row] = await sql`
    SELECT id, user_id, gateway, gateway_reference, status, package_key, credits,
           amount_usd_cents, metadata, created_at, completed_at
    FROM payments
    WHERE id = ${paymentId}
  `;
  return row || null;
}
