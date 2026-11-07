// Sender license checkout: create the order, open a Cryptomus invoice or a Polar checkout, redirect.
// Nothing here issues a license; only the payment webhooks do.

import { redirect, data } from 'react-router';
import { getOptionalUser } from '~/utils/session.server';
import { validateEmail } from '~/utils/validation.server';
import { createInvoice } from '~/lib/cryptomus.server';
import { createPolarLicenseCheckout } from '~/lib/polar.server';
import {
  createOrder,
  createOrderPayment,
  markOrderPaymentOpen,
  markOrderPaymentCreateFailed,
  getOrderForViewer,
  paidSoFarCents,
} from '~/lib/licenseOrders.server';
import { CRYPTOMUS_ENABLED, POLAR_ENABLED, getPublicUrl } from '~/utils/paymentsConfig.server';
import { priceForKey, getPolarSenderProductId, LICENSE_INVOICE_LIFETIME_SEC } from '~/utils/senderConfig.server';
import { readOrderTokens, orderTokenCookie } from '~/utils/orderAccess.server';
import { affiliateForCheckout } from '~/lib/affiliates.server';
import { recordEvent, buildEventFromRequest, getCountry, getClientIp } from '~/utils/analytics.server';

const knownCountry = (code) => (/^[A-Z]{2}$/.test(code || '') && code !== 'XX' && code !== 'T1' ? code : null);
const publicIp = (ip) =>
  !ip || ip === 'unknown' || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/i.test(ip) ? null : ip;

export function gatewayAvailable(gateway, priceKey) {
  if (gateway === 'cryptomus') return CRYPTOMUS_ENABLED;
  if (gateway === 'polar') return POLAR_ENABLED && Boolean(getPolarSenderProductId(priceKey));
  return false;
}

// Opens one gateway attempt for amountCents. Returns { url } or { error }.
async function openAttempt(request, order, amountCents) {
  const payment = await createOrderPayment(order.id, { gateway: order.gateway, amountUsdCents: amountCents });
  const orderUrl = `${getPublicUrl()}/sender/order/${order.id}`;
  try {
    if (order.gateway === 'cryptomus') {
      const invoice = await createInvoice({
        orderId: payment.gateway_order_id,
        amountUsd: (amountCents / 100).toFixed(2),
        customerEmail: order.email,
        returnUrl: orderUrl,
        lifetimeSec: LICENSE_INVOICE_LIFETIME_SEC,
        allowTopUp: true,
      });
      await markOrderPaymentOpen(payment.id, {
        gatewayReference: invoice.uuid,
        checkoutUrl: invoice.url,
        expiresAt: invoice.expiredAt ? new Date(invoice.expiredAt * 1000) : null,
      });
      return { url: invoice.url };
    }

    const checkout = await createPolarLicenseCheckout({
      orderId: order.id,
      productId: getPolarSenderProductId(order.price_key),
      userId: order.user_id,
      customerEmail: order.email,
      priceKey: order.price_key,
      country: knownCountry(getCountry(request)),
      ipAddress: publicIp(getClientIp(request)),
    });
    await markOrderPaymentOpen(payment.id, { gatewayReference: checkout.id, checkoutUrl: checkout.url });
    return { url: checkout.url };
  } catch (err) {
    console.error(`[sender checkout] ${order.gateway} attempt failed for order ${order.id}: ${err.message}`);
    await markOrderPaymentCreateFailed(payment.id, err.message);
    return { error: 'Could not open the payment page. Try again in a minute, or write to support@trovarcis.com.' };
  }
}

// Cryptomus renews an expired invoice under the same order_id, so the buyer keeps one invoice.
async function reopenInvoice(order, payment) {
  try {
    const invoice = await createInvoice({
      orderId: payment.gateway_order_id,
      amountUsd: (payment.amount_usd_cents / 100).toFixed(2),
      customerEmail: order.email,
      returnUrl: `${getPublicUrl()}/sender/order/${order.id}`,
      lifetimeSec: LICENSE_INVOICE_LIFETIME_SEC,
      allowTopUp: true,
      refresh: true,
    });
    const row = await markOrderPaymentOpen(payment.id, {
      gatewayReference: invoice.uuid,
      checkoutUrl: invoice.url,
      expiresAt: invoice.expiredAt ? new Date(invoice.expiredAt * 1000) : null,
    });
    return row ? { url: invoice.url } : { error: 'This invoice changed. Reload the page.' };
  } catch (err) {
    console.error(`[sender checkout] reopen failed for order ${order.id}: ${err.message}`);
    return null;
  }
}

export async function senderCheckoutAction({ request }) {
  const user = await getOptionalUser(request);
  const form = await request.formData();
  const gateway = String(form.get('gateway') || '');
  const priceKey = String(form.get('priceKey') || '');

  let email;
  if (user) {
    email = user.email;
  } else {
    const checked = validateEmail(String(form.get('email') || ''));
    if (!checked.ok) return data({ errors: { email: checked.error } }, { status: 400 });
    email = checked.value;
  }

  const price = priceForKey(priceKey, { isAdmin: user?.role === 'admin' });
  if (!price) return data({ errors: { _form: 'The price changed since this page loaded. Reload the page and try again.' } }, { status: 409 });
  if (!['cryptomus', 'polar'].includes(gateway)) return data({ errors: { gateway: 'Choose card or crypto.' } }, { status: 400 });
  if (!gatewayAvailable(gateway, price.key)) {
    return data({ errors: { gateway: gateway === 'polar' ? 'Card payment is not available right now. Pay with crypto.' : 'Crypto payment is not available right now. Pay by card.' } }, { status: 503 });
  }

  // Credit the affiliate whose link brought the buyer (last click within 90 days), never the buyer.
  const affiliateId = await affiliateForCheckout(request, { userId: user?.id ?? null, email }).catch(() => null);
  const { order, token } = await createOrder({ userId: user?.id ?? null, email, priceKey: price.key, amountUsdCents: price.cents, gateway, affiliateId });

  recordEvent(buildEventFromRequest(request, {
    eventType: 'checkout_click',
    path: '/sender',
    userId: user?.id ?? null,
    metadata: { product: 'sender', gateway, order_id: order.id, price_key: price.key, amount_usd_cents: price.cents },
  }));

  const cookie = orderTokenCookie(request, order.id, token);
  const attempt = await openAttempt(request, order, price.cents);
  if (attempt.error) {
    // The order page can retry, so the buyer lands there rather than losing the order.
    throw redirect(`/sender/order/${order.id}`, { headers: { 'Set-Cookie': cookie } });
  }
  throw redirect(attempt.url, { headers: { 'Set-Cookie': cookie } });
}

// Order page actions: reopen an expired invoice, pay what is still missing, or try again.
export async function senderOrderAction({ request, params }) {
  const user = await getOptionalUser(request);
  const view = await getOrderForViewer(params.orderId, { user, tokens: readOrderTokens(request) });
  if (!view) throw new Response('Not found', { status: 404 });
  const { order, payments } = view;
  if (order.status !== 'open') throw redirect(`/sender/order/${order.id}`);

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const latest = payments[payments.length - 1] || null;
  const now = Date.now();
  const lapsed = (p) => p.status === 'open' && p.expires_at && new Date(p.expires_at).getTime() < now;
  const live = payments.some((p) => ['creating', 'confirming', 'partial'].includes(p.status) || (p.status === 'open' && !lapsed(p)));
  if (live) return data({ error: 'A payment for this order is still open. Use the button above to finish it.' }, { status: 409 });

  const due = order.amount_usd_cents - paidSoFarCents(payments);
  if (due <= 0) return data({ error: 'This order is paid. Your key appears here when the payment confirms.' }, { status: 409 });
  if (!gatewayAvailable(order.gateway, order.price_key)) {
    return data({ error: 'This payment method is not available right now. Start a new order with the other one.' }, { status: 503 });
  }

  if (intent === 'reopen' && latest && order.gateway === 'cryptomus' && latest.paid_usd_cents === 0
      && (latest.status === 'expired' || lapsed(latest))) {
    const reopened = await reopenInvoice(order, latest);
    if (reopened?.url) throw redirect(reopened.url);
    if (reopened?.error) return data({ error: reopened.error }, { status: 409 });
    // Cryptomus would not renew it; a fresh invoice for the same amount does the same job.
  }

  if (!['reopen', 'pay_rest', 'retry'].includes(intent)) return data({ error: 'Unknown action.' }, { status: 400 });
  const attempt = await openAttempt(request, order, due);
  if (attempt.error) return data({ error: attempt.error }, { status: 502 });
  throw redirect(attempt.url);
}
