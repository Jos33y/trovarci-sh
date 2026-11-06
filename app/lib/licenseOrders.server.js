// Sender license orders: create, track each gateway attempt, and issue or revoke the license.
// Only a verified webhook reaches applyCryptomusEvent and the Polar functions, so only a webhook issues.

import crypto from 'node:crypto';
import { sql } from '~/utils/db.server';
import { issueLicense, revokeLicense } from '~/lib/licenses.server';
import { logSystemAction } from '~/utils/adminActions.server';
import { SENDER_MAX_DEVICES } from '~/utils/senderConfig.server';

// Crypto lands a few cents short when the rate moves between invoice and confirmation.
const TOLERANCE_CENTS = (() => {
  const n = parseInt(process.env.LICENSE_UNDERPAYMENT_TOLERANCE_CENTS || '50', 10);
  return Number.isInteger(n) && n >= 0 ? n : 50;
})();

// A password hash that argon2 cannot parse, so it never verifies. A guest buyer's account is
// opened by resetting the password, which proves the email is theirs.
const NO_PASSWORD = '!no-password';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isOrderId = (value) => typeof value === 'string' && UUID_RE.test(value);

// ---------------------------------------------------------------------------
// Access tokens: the buyer's browser holds one per order, the database holds its hash
// ---------------------------------------------------------------------------

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest();
}

function tokenMatches(token, hash) {
  if (!token || !hash) return false;
  const given = hashToken(token);
  return given.length === hash.length && crypto.timingSafeEqual(given, hash);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOrder({ userId = null, email, priceKey, amountUsdCents, gateway }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const [order] = await sql`
    INSERT INTO license_orders (user_id, email, price_key, amount_usd_cents, gateway, access_token_hash)
    VALUES (${userId}, ${email}, ${priceKey}, ${amountUsdCents}, ${gateway}, ${hashToken(token)})
    RETURNING *
  `;
  return { order, token };
}

// The first attempt is known to the gateway by the order id itself; later ones add a suffix,
// because Cryptomus returns the existing invoice for an order_id it has seen.
export async function createOrderPayment(orderId, { gateway, amountUsdCents }) {
  return sql.begin(async (tx) => {
    await tx`SELECT id FROM license_orders WHERE id = ${orderId} FOR UPDATE`;
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM license_order_payments WHERE order_id = ${orderId}`;
    const gatewayOrderId = n === 0 ? orderId : `${orderId}_${n + 1}`;
    const [row] = await tx`
      INSERT INTO license_order_payments (order_id, gateway, gateway_order_id, amount_usd_cents)
      VALUES (${orderId}, ${gateway}, ${gatewayOrderId}, ${amountUsdCents})
      RETURNING *
    `;
    return row;
  });
}

export async function markOrderPaymentOpen(paymentId, { gatewayReference, checkoutUrl, expiresAt = null }) {
  const [row] = await sql`
    UPDATE license_order_payments
    SET status = 'open', gateway_reference = ${gatewayReference}, checkout_url = ${checkoutUrl}, expires_at = ${expiresAt}
    WHERE id = ${paymentId} AND status IN ('creating', 'expired')
    RETURNING *
  `;
  return row || null;
}

export async function markOrderPaymentCreateFailed(paymentId, reason) {
  await sql`
    UPDATE license_order_payments
    SET status = 'failed', raw_webhook = ${sql.json({ create_error: String(reason).slice(0, 300) })}
    WHERE id = ${paymentId} AND status = 'creating'
  `;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getOrder(orderId) {
  if (!isOrderId(orderId)) return null;
  const [row] = await sql`SELECT * FROM license_orders WHERE id = ${orderId}`;
  return row || null;
}

export async function listOrderPayments(orderId, db = sql) {
  return db`SELECT * FROM license_order_payments WHERE order_id = ${orderId} ORDER BY id ASC`;
}

export function paidSoFarCents(payments) {
  return payments
    .filter((p) => ['partial', 'paid', 'underpaid'].includes(p.status))
    .reduce((sum, p) => sum + p.paid_usd_cents, 0);
}

// The order, its attempts and, once paid, its license. Null unless the viewer owns the order
// or their browser holds its access token.
export async function getOrderForViewer(orderId, { user = null, tokens = [] } = {}) {
  const order = await getOrder(orderId);
  if (!order) return null;
  const owns = user && order.user_id && order.user_id === user.id;
  const holdsToken = tokens.some((t) => tokenMatches(t, order.access_token_hash));
  if (!owns && !holdsToken) return null;

  const payments = await listOrderPayments(order.id);
  let license = null;
  if (order.license_id) {
    const [row] = await sql`
      SELECT l.id, l.license_key, l.status, l.max_devices, l.issued_at, l.revoked_at,
             (SELECT count(*)::int FROM license_activations a
               WHERE a.license_id = l.id AND a.released_at IS NULL) AS live_devices
      FROM licenses l WHERE l.id = ${order.license_id}
    `;
    license = row || null;
  }
  return { order, payments, license };
}

export async function listOrdersForUser(userId) {
  return sql`
    SELECT id, status, amount_usd_cents, gateway, license_id, created_at, paid_at, refunded_at
    FROM license_orders
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
}

// ---------------------------------------------------------------------------
// Issue and revoke, each in the caller's transaction with its audit row
// ---------------------------------------------------------------------------

async function findOrCreateBuyer(tx, email) {
  const [existing] = await tx`SELECT id FROM users WHERE email = ${email} AND deleted_at IS NULL`;
  if (existing) return { userId: existing.id, created: false };
  const [row] = await tx`
    INSERT INTO users (email, password_hash, credits_balance)
    VALUES (${email}, ${NO_PASSWORD}, 0)
    RETURNING id
  `;
  return { userId: row.id, created: true };
}

async function fulfillInTx(tx, order, { gateway, paymentReference }) {
  if (order.status !== 'open') return { issued: false, alreadyIssued: Boolean(order.license_id) };

  const { userId, created } = order.user_id
    ? { userId: order.user_id, created: false }
    : await findOrCreateBuyer(tx, order.email);

  const reference = `${gateway}:${paymentReference}`;
  const license = await issueLicense({
    userId,
    maxDevices: SENDER_MAX_DEVICES,
    paymentReference: reference,
    issuedBy: null,
  }, tx);

  await logSystemAction(tx, {
    actionType: 'license_issue',
    targetUserId: userId,
    targetKind: 'license',
    targetId: license.id,
    reason: 'Paid order',
    context: {
      order_id: order.id,
      owner_id: userId,
      owner_email: order.email,
      gateway,
      payment_reference: reference,
      amount_usd_cents: order.amount_usd_cents,
      price_key: order.price_key,
      max_devices: SENDER_MAX_DEVICES,
      created_account: created,
    },
  });

  await tx`
    UPDATE license_orders
    SET status = 'paid', user_id = ${userId}, license_id = ${license.id},
        payment_reference = ${reference}, paid_at = now()
    WHERE id = ${order.id}
  `;

  return { issued: true, licenseId: license.id, userId, createdAccount: created };
}

async function refundInTx(tx, order, { source, reference }) {
  if (order.status !== 'paid') return { revoked: false };
  const result = await revokeLicense({ licenseId: order.license_id, reason: 'Refunded' }, tx);

  await logSystemAction(tx, {
    actionType: 'license_revoke',
    targetUserId: order.user_id,
    targetKind: 'license',
    targetId: order.license_id,
    reason: 'Refunded',
    context: { order_id: order.id, owner_id: order.user_id, source, reference, was_active: result.ok },
  });

  await tx`UPDATE license_orders SET status = 'refunded', refunded_at = now() WHERE id = ${order.id}`;
  return { revoked: true };
}

// Locks the order, then its attempt. Every webhook path goes through here, so two deliveries
// of the same event run one after the other and the second finds the work done.
async function withLockedAttempt(gateway, find, fn) {
  return sql.begin(async (tx) => {
    const [probe] = await find(tx);
    if (!probe) return { handled: false };
    const [order] = await tx`SELECT * FROM license_orders WHERE id = ${probe.order_id} FOR UPDATE`;
    const [payment] = await tx`SELECT * FROM license_order_payments WHERE id = ${probe.id} FOR UPDATE`;
    return { handled: true, orderId: order.id, ...(await fn(tx, order, payment)) };
  });
}

async function settleIfCovered(tx, order, payment, gateway, paymentReference) {
  const payments = await listOrderPayments(order.id, tx);
  const paid = paidSoFarCents(payments);
  if (paid + TOLERANCE_CENTS < order.amount_usd_cents) return { issued: false, shortCents: order.amount_usd_cents - paid };
  return fulfillInTx(tx, order, { gateway, paymentReference });
}

const toCents = (usd) => {
  const n = Math.round(parseFloat(usd) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---------------------------------------------------------------------------
// Cryptomus
// ---------------------------------------------------------------------------

const FINAL = new Set(['paid', 'refunded']);

export async function applyCryptomusEvent(payload) {
  const gatewayOrderId = String(payload.order_id || '');
  const status = String(payload.status || '');

  return withLockedAttempt(
    'cryptomus',
    (tx) => tx`SELECT id, order_id FROM license_order_payments WHERE gateway = 'cryptomus' AND gateway_order_id = ${gatewayOrderId}`,
    async (tx, order, payment) => {
      const reported = toCents(payload.payment_amount_usd);
      const record = (newStatus, paidCents = payment.paid_usd_cents) => tx`
        UPDATE license_order_payments
        SET status = ${newStatus}, paid_usd_cents = ${paidCents}, gateway_status = ${status},
            txid = COALESCE(${payload.txid ?? null}, txid),
            payer_currency = COALESCE(${payload.payer_currency ?? null}, payer_currency),
            payer_amount = COALESCE(${payload.payer_amount ?? null}, payer_amount),
            gateway_reference = COALESCE(gateway_reference, ${payload.uuid ?? null}),
            raw_webhook = ${tx.json(payload)}
        WHERE id = ${payment.id}
      `;

      if (status === 'refund_paid') {
        if (payment.status === 'paid') await record('refunded');
        const refund = await refundInTx(tx, order, { source: 'cryptomus', reference: payload.uuid ?? gatewayOrderId });
        return { outcome: refund.revoked ? 'refunded' : 'refund_noop' };
      }

      // A paid or refunded attempt never moves backwards on a late or replayed event.
      if (FINAL.has(payment.status)) {
        if (status === 'paid' || status === 'paid_over') {
          const settled = await settleIfCovered(tx, order, payment, 'cryptomus', payment.gateway_reference || gatewayOrderId);
          return { outcome: settled.issued ? 'issued' : 'already_paid', ...settled };
        }
        return { outcome: 'ignored_after_final' };
      }

      switch (status) {
        case 'paid':
        case 'paid_over': {
          const paidCents = Math.max(payment.paid_usd_cents, reported ?? payment.amount_usd_cents);
          await record(paidCents + TOLERANCE_CENTS >= payment.amount_usd_cents ? 'paid' : 'underpaid', paidCents);
          const settled = await settleIfCovered(tx, order, payment, 'cryptomus', payload.uuid ?? payment.gateway_reference ?? gatewayOrderId);
          return { outcome: settled.issued ? 'issued' : (settled.alreadyIssued ? 'already_paid' : 'short'), ...settled };
        }
        case 'wrong_amount_waiting':
          await record('partial', Math.max(payment.paid_usd_cents, reported ?? 0));
          return { outcome: 'partial' };
        case 'wrong_amount':
          await record('underpaid', Math.max(payment.paid_usd_cents, reported ?? 0));
          return { outcome: 'underpaid' };
        case 'check':
        case 'confirm_check':
        case 'process':
        case 'locked':
          await record(payment.paid_usd_cents > 0 ? 'partial' : 'confirming');
          return { outcome: 'confirming' };
        case 'cancel':
          await record(payment.paid_usd_cents > 0 ? 'underpaid' : 'expired');
          return { outcome: 'expired' };
        case 'fail':
        case 'system_fail':
          await record(payment.paid_usd_cents > 0 ? 'underpaid' : 'failed');
          return { outcome: 'failed' };
        default:
          return { outcome: 'ignored_status' };
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Polar
// ---------------------------------------------------------------------------

const findPolarAttempt = (checkoutId) => (tx) =>
  tx`SELECT id, order_id FROM license_order_payments WHERE gateway = 'polar' AND gateway_reference = ${String(checkoutId || '')}`;

export async function applyPolarOrderPaid(polarOrder) {
  return withLockedAttempt('polar', findPolarAttempt(polarOrder.checkout_id), async (tx, order, payment) => {
    if (polarOrder.metadata?.license_order_id && polarOrder.metadata.license_order_id !== order.id) {
      return { outcome: 'order_mismatch' };
    }
    if (String(polarOrder.currency || '').toLowerCase() !== 'usd') return { outcome: 'wrong_currency' };

    // Polar includes tax in the price in some countries and adds it in others, so the price the
    // buyer saw is whichever of total and net matches ours.
    const total = Number.isInteger(polarOrder.total_amount) ? polarOrder.total_amount : 0;
    const net = Number.isInteger(polarOrder.net_amount) ? polarOrder.net_amount : 0;
    const expected = payment.amount_usd_cents;
    const priceCents = total === expected || net === expected ? expected : Math.max(total, net);

    if (!FINAL.has(payment.status)) {
      await tx`
        UPDATE license_order_payments
        SET status = ${priceCents + TOLERANCE_CENTS >= expected ? 'paid' : 'underpaid'},
            paid_usd_cents = ${priceCents}, gateway_status = 'paid', txid = ${polarOrder.id ?? null},
            raw_webhook = ${tx.json({ id: polarOrder.id, receipt_number: polarOrder.receipt_number ?? null, total_amount: total, net_amount: net, tax_amount: polarOrder.tax_amount ?? null })}
        WHERE id = ${payment.id}
      `;
    }
    const settled = await settleIfCovered(tx, order, payment, 'polar', polarOrder.id);
    return { outcome: settled.issued ? 'issued' : (settled.alreadyIssued ? 'already_paid' : 'short'), ...settled };
  });
}

export async function applyPolarCheckoutClosed(checkout, status) {
  return withLockedAttempt('polar', findPolarAttempt(checkout.id), async (tx, order, payment) => {
    if (!['creating', 'open', 'confirming'].includes(payment.status)) return { outcome: 'ignored' };
    await tx`UPDATE license_order_payments SET status = ${status}, gateway_status = ${status} WHERE id = ${payment.id}`;
    return { outcome: status };
  });
}

export async function applyPolarRefund(polarOrder) {
  return withLockedAttempt('polar', findPolarAttempt(polarOrder.checkout_id), async (tx, order, payment) => {
    // A partial refund is a goodwill gesture, not a return; only a full refund revokes.
    if (polarOrder.status !== 'refunded') return { outcome: 'partial_refund_logged' };
    await tx`UPDATE license_order_payments SET status = 'refunded', gateway_status = 'refunded' WHERE id = ${payment.id}`;
    const refund = await refundInTx(tx, order, { source: 'polar', reference: polarOrder.id });
    return { outcome: refund.revoked ? 'refunded' : 'refund_noop' };
  });
}

// ---------------------------------------------------------------------------
// After commit: the key email. Never throws; the outcome is kept on the order.
// ---------------------------------------------------------------------------

export async function deliverLicenseKey(orderId, sendEmail) {
  try {
    const [row] = await sql`
      SELECT o.id, o.email, o.key_email_sent_at, l.license_key, l.id AS license_id
      FROM license_orders o JOIN licenses l ON l.id = o.license_id
      WHERE o.id = ${orderId} AND o.status = 'paid'
    `;
    if (!row || row.key_email_sent_at) return { sent: false };

    const [{ created_account: createdAccount } = {}] = await sql`
      SELECT (context->>'created_account')::boolean AS created_account
      FROM admin_actions
      WHERE action_type = 'license_issue' AND actor_kind = 'system' AND context->>'order_id' = ${orderId}
    `;

    await sendEmail({ to: row.email, licenseKey: row.license_key, licenseId: row.license_id, orderId, createdAccount: Boolean(createdAccount) });
    await sql`UPDATE license_orders SET key_email_sent_at = now(), key_email_error = NULL WHERE id = ${orderId}`;
    return { sent: true };
  } catch (err) {
    const message = String(err?.message || 'unknown').slice(0, 300);
    console.error(`[license orders] key email failed for order ${orderId}: ${message}`);
    await sql`UPDATE license_orders SET key_email_error = ${message} WHERE id = ${orderId}`.catch(() => {});
    return { sent: false, error: message };
  }
}

// After commit: tell the owner about a sale or a refund, with no buyer details. Never throws.
export async function alertOwner(orderId, kind, sendAlert) {
  try {
    const [row] = await sql`
      SELECT o.amount_usd_cents, o.gateway
      FROM license_orders o WHERE o.id = ${orderId}
    `;
    if (!row) return;
    await sendAlert({
      kind,
      amountUsd: (row.amount_usd_cents / 100).toFixed(2),
      method: row.gateway === 'polar' ? 'card' : 'crypto',
    });
  } catch (err) {
    console.error(`[license orders] owner alert failed for order ${orderId}: ${String(err?.message || err).slice(0, 200)}`);
  }
}
