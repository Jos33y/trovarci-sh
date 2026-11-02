// POST /api/webhooks/polar - grants Credits when Polar reports an order paid. Replays are safe: completePayment is idempotent.

import { verifyPolarWebhook } from '~/lib/polar.server';
import { completePayment, markPaymentTerminal, getPaymentById, resizeCustomPayment } from '~/lib/payments.server';
import { getPackage } from '~/utils/paymentsConfig.server';
import { recordEventSync } from '~/utils/analytics.server';
import { sendPaymentReceiptEmail } from '~/utils/email.server';

// Polar retries any non-2xx and disables the endpoint after 10 straight failures,
// so only a bad signature or a transient error returns one.
const accepted = (reason) =>
  new Response(JSON.stringify({ ok: true, reason }), { status: 202, headers: { 'Content-Type': 'application/json' } });

function funnel(eventType, payment, metadata) {
  return recordEventSync({
    event_type: eventType,
    session_hash: 'webhook',
    user_id: payment.user_id,
    path: '/api/webhooks/polar',
    country: 'XX',
    device_class: 'unknown',
    is_bot: false,
    metadata: { gateway: 'polar', payment_id: payment.id, ...metadata },
  }).catch((err) => console.error('[polar webhook] funnel record failed:', err.message));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findPayment(paymentId) {
  if (typeof paymentId !== 'string' || !UUID_RE.test(paymentId)) return null;
  const payment = await getPaymentById(paymentId);
  return payment && payment.gateway === 'polar' ? payment : null;
}

async function handleOrderPaid(event, order) {
  if (order.status !== 'paid' && order.paid !== true) return accepted('not_paid');

  let payment = await findPayment(order.metadata?.payment_id);
  if (!payment) return accepted('unknown_payment');
  if (order.checkout_id && payment.gateway_reference && order.checkout_id !== payment.gateway_reference) {
    console.warn(`[polar webhook] checkout mismatch on payment ${payment.id}`);
    return accepted('checkout_mismatch');
  }
  if (String(order.currency || '').toLowerCase() !== 'usd') {
    console.warn(`[polar webhook] non-USD order ${order.id} for payment ${payment.id}`);
    return accepted('wrong_currency');
  }

  // Custom is pay-what-you-want: the buyer can change the amount on Polar's page,
  // so the Credits follow what was actually paid, 1 per cent.
  if (payment.package_key === 'custom' && Number.isInteger(order.net_amount) && order.net_amount > 0
      && order.net_amount !== payment.amount_usd_cents) {
    await resizeCustomPayment(payment.id, order.net_amount, payment.amount_usd_cents);
    payment = await getPaymentById(payment.id);
  }

  // net_amount is what was charged for the product, before tax and after discounts (which are off).
  const paymentAmountUsd = Number.isFinite(order.net_amount) ? (order.net_amount / 100).toFixed(2) : null;

  const result = await completePayment(payment.id, {
    txid: order.id,
    payerCurrency: 'USD',
    payerAmount: Number.isFinite(order.total_amount) ? (order.total_amount / 100).toFixed(2) : paymentAmountUsd,
    paymentAmountUsd,
    paymentMethodName: 'Card',
    rawWebhook: event,
  });

  if (result.underpaid) {
    await funnel('payment_failed', payment, { reason: 'underpayment', shortfall_cents: result.shortfallCents });
    return accepted('underpaid');
  }
  if (result.alreadyCompleted) return accepted('already_completed');

  await funnel('payment_confirmed', payment, {
    credits: payment.credits,
    amount_usd_cents: payment.amount_usd_cents,
    currency: 'USD',
  });

  if (result.userEmail && result.transactionId) {
    const pkg = getPackage(payment.package_key);
    sendPaymentReceiptEmail({
      to: result.userEmail,
      transactionId: result.transactionId,
      credits: payment.credits,
      amountUsd: (payment.amount_usd_cents / 100).toFixed(2),
      paymentMethod: 'Card',
      packageName: pkg?.name || payment.package_key,
      newBalance: result.newBalance,
    }).catch((err) => console.error('[polar webhook] receipt email failed:', err.message));
  }
  return accepted('confirmed');
}

async function handleCheckoutUpdated(event, checkout) {
  if (checkout.status !== 'expired' && checkout.status !== 'failed') return accepted('checkout_open');
  const payment = await findPayment(checkout.metadata?.payment_id);
  if (!payment) return accepted('unknown_payment');
  await markPaymentTerminal(payment.id, checkout.status, { rawWebhook: event });
  await funnel(checkout.status === 'expired' ? 'payment_abandoned' : 'payment_failed', payment, { status: checkout.status });
  return accepted(checkout.status);
}

export async function loader() {
  return new Response('Method not allowed', { status: 405 });
}

export async function action({ request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return accepted('bad_body');
  }
  if (!rawBody) return accepted('empty_body');

  if (!verifyPolarWebhook(rawBody, request.headers)) {
    console.warn('[polar webhook] signature verification failed');
    return new Response('Invalid signature', { status: 403 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return accepted('malformed_json');
  }
  const data = event?.data;
  if (!event?.type || !data) return accepted('missing_fields');

  try {
    if (event.type === 'order.paid') return await handleOrderPaid(event, data);
    if (event.type === 'checkout.updated') return await handleCheckoutUpdated(event, data);
    if (event.type === 'order.refunded') {
      console.warn(`[polar webhook] order.refunded for order ${data.id} (payment ${data.metadata?.payment_id || 'unknown'}); admin review required`);
      return accepted('refund_logged');
    }
    return accepted('ignored_event');
  } catch (err) {
    console.error('[polar webhook] processing error:', err);
    return new Response('Processing error', { status: 500 });
  }
}
