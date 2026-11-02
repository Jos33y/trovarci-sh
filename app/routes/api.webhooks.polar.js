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

  // Polar's "location" tax setting includes tax in the price in some countries (UK, EU) and adds it
  // on top in others (US, India), so an order's price is its total in one case and its net in the
  // other. Whichever of the two matches what we expected is the price the buyer saw.
  const { total_amount: total, net_amount: net } = order;
  if (!Number.isInteger(total) || total <= 0) {
    console.warn(`[polar webhook] order ${order.id} has no usable amount`);
    return accepted('no_amount');
  }
  const expected = payment.amount_usd_cents;
  let priceCents = total === expected || net === expected ? expected : Math.max(total, net || 0);

  // Custom is pay-what-you-want: if the buyer changed the amount on Polar's page, the Credits follow
  // the amount before any tax added on top (net), 1 per cent.
  if (payment.package_key === 'custom' && priceCents !== expected) {
    priceCents = Number.isInteger(net) && net > 0 ? net : total;
    await resizeCustomPayment(payment.id, priceCents, expected);
    payment = await getPaymentById(payment.id);
  }

  const paymentAmountUsd = (priceCents / 100).toFixed(2);

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

async function handleCheckoutClosed(event, checkout) {
  const status = event.type === 'checkout.expired' ? 'expired' : checkout.status;
  if (status !== 'expired' && status !== 'failed') return accepted('checkout_open');
  const payment = await findPayment(checkout.metadata?.payment_id);
  if (!payment) return accepted('unknown_payment');
  await markPaymentTerminal(payment.id, status, { rawWebhook: event });
  await funnel(status === 'expired' ? 'payment_abandoned' : 'payment_failed', payment, { status });
  return accepted(status);
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
    if (event.type === 'checkout.updated' || event.type === 'checkout.expired') return await handleCheckoutClosed(event, data);
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
