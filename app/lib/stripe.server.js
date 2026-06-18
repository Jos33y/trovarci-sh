/**
 * Stripe API client.
 *
 * Direct fetch to api.stripe.com - no SDK dependency. Mirrors the Cryptomus
 * client in shape so the checkout action can pick a gateway without
 * branching on call signatures.
 *
 * Why no SDK:
 *   1. Bundle weight - the official `stripe` npm package pulls in ~700KB of
 *      JS the worker process never executes anyway.
 *   2. Surface area - the SDK exposes hundreds of resources we will never
 *      use. Direct fetch limits the audit surface to the two endpoints we
 *      actually call.
 *   3. Pattern consistency - Cryptomus, Telegram, and IPRoyal already use
 *      direct fetch in this codebase. One style is easier to maintain than
 *      five.
 *   4. Stripe's API is plain HTTPS + form-urlencoded body + Bearer auth.
 *      The SDK saves ~10 lines per call and adds a vendor.
 *
 * The pure signature primitives (parseStripeSignatureHeader, computeStripeSignature,
 * verifyStripeWebhookSignature) live in stripeSignature.server.js so they
 * unit-test under bare Node.
 *
 * Reference:
 *   https://stripe.com/docs/api/checkout/sessions/create
 *   https://stripe.com/docs/api/checkout/sessions/retrieve
 *   https://stripe.com/docs/webhooks
 */

import {
  STRIPE_API_BASE,
  getStripeCredentials,
  getPublicUrl,
} from '~/utils/paymentsConfig.server';
import {
  parseStripeSignatureHeader,
  computeStripeSignature,
  verifyStripeWebhookSignature,
} from './stripeSignature.server.js';

// Re-export pure primitives so route imports stay symmetrical with cryptomus.
export {
  parseStripeSignatureHeader,
  computeStripeSignature,
  verifyStripeWebhookSignature,
};

// -----------------------------------------------------------------------
// Form encoding
//
// Stripe expects application/x-www-form-urlencoded with a peculiar
// nested-object syntax: line_items[0][price_data][unit_amount]=500.
// URLSearchParams handles flat keys, not nested. We walk the object
// ourselves and emit `parent[child]=value` keys.
//
// Arrays use numeric indices (line_items[0], line_items[1]) per Stripe.
// Booleans serialize as 'true'/'false'. Nulls/undefineds are skipped
// entirely - Stripe treats absent fields as default-valued.
// -----------------------------------------------------------------------

function encodeStripeForm(obj, prefix = '', out = new URLSearchParams()) {
  if (obj == null) return out;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      encodeStripeForm(item, prefix ? `${prefix}[${i}]` : String(i), out);
    });
    return out;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (value == null) continue;
      const k = prefix ? `${prefix}[${key}]` : key;
      if (typeof value === 'object') {
        encodeStripeForm(value, k, out);
      } else {
        out.append(k, String(value));
      }
    }
    return out;
  }

  out.append(prefix, String(obj));
  return out;
}

// -----------------------------------------------------------------------
// HTTP client
// -----------------------------------------------------------------------

async function stripeRequest(method, path, payload = null, opts = {}) {
  const { secretKey } = getStripeCredentials();
  const url = `${STRIPE_API_BASE}${path}`;

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    // Pinned API version. Bump deliberately after reviewing the Stripe
    // changelog at https://docs.stripe.com/changelog. Pinning protects
    // against silent shape changes; never leave this header unset.
    'Stripe-Version': '2026-04-22.dahlia',
  };

  // Idempotency-Key on POST so a transient retry never creates two
  // checkout sessions for the same payments.id. Stripe holds the result
  // for 24 hours.
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  let body;
  if (payload && method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encodeStripeForm(payload).toString();
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Stripe returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const code = data?.error?.code || data?.error?.type || 'stripe_error';
    const err = new Error(`Stripe error: ${msg}`);
    err.stripeCode = code;
    err.stripeStatus = res.status;
    throw err;
  }

  return data;
}

// -----------------------------------------------------------------------
// Checkout session creation
// -----------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session for a credit purchase.
 *
 * @param {object} params
 * @param {string} params.paymentId       Our payments.id (UUID). Used as
 *                                        client_reference_id and metadata.
 * @param {number} params.amountUsdCents  Integer cents.
 * @param {number} params.credits         Credit count being purchased.
 * @param {string} params.packageKey      'starter' | 'growth' | 'pro' | 'custom'
 * @param {string} params.packageName     Human-readable name for line item.
 * @param {string} [params.customerEmail] Pre-fill the email field.
 *
 * @returns {Promise<{
 *   id: string,           // Stripe checkout session id (cs_test_... / cs_live_...)
 *   url: string,          // Hosted checkout URL
 *   paymentIntent: string | null,  // pi_... once created (null if pending)
 * }>}
 */
export async function createCheckoutSession({
  paymentId,
  amountUsdCents,
  credits,
  packageKey,
  packageName,
  customerEmail,
}) {
  const publicUrl = getPublicUrl();

  const payload = {
    mode: 'payment',
    // payment_method_types is intentionally omitted. Stripe's current
    // recommendation is "dynamic payment methods" - the methods shown to
    // the customer are managed in the Stripe Dashboard, not pinned in
    // code. Cards are enabled by default; Apple Pay and Google Pay
    // auto-enable when configured. Pinning the array would prevent the
    // dashboard toggle from doing anything, which is the wrong default
    // for a live-keys-not-yet-configured deploy.
    // Reference: https://docs.stripe.com/connect/dynamic-payment-methods
    client_reference_id: paymentId,
    success_url: `${publicUrl}/credits/pending/${paymentId}`,
    cancel_url: `${publicUrl}/credits`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountUsdCents,
          product_data: {
            name: `${packageName} (${credits.toLocaleString()} credits)`,
          },
        },
      },
    ],
    metadata: {
      payment_id: paymentId,
      package_key: packageKey,
      credits: String(credits),
    },
    payment_intent_data: {
      metadata: {
        payment_id: paymentId,
      },
    },
  };

  if (customerEmail) {
    payload.customer_email = customerEmail;
  }

  // Idempotency: paymentId is unique per checkout attempt (we generate a
  // fresh payments row for every click). Stripe will return the same
  // session if this exact request is replayed within 24h, which is what
  // we want for transient retries inside the action.
  const session = await stripeRequest('POST', '/v1/checkout/sessions', payload, {
    idempotencyKey: `checkout:${paymentId}`,
  });

  return {
    id: session.id,
    url: session.url,
    paymentIntent: session.payment_intent || null,
  };
}

// -----------------------------------------------------------------------
// Session retrieval (used by /credits/pending if Stripe payment)
// -----------------------------------------------------------------------

export async function getCheckoutSession(sessionId) {
  return await stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

// -----------------------------------------------------------------------
// Status mapping
//
// Stripe Checkout Session has two relevant fields:
//   - `status`         : 'open' | 'complete' | 'expired'
//   - `payment_status` : 'paid' | 'unpaid' | 'no_payment_required'
//
// A session can be `complete` with `payment_status='unpaid'` if the
// customer used a delayed payment method (we don't enable any), so the
// authoritative pair is (status='complete' AND payment_status='paid').
// -----------------------------------------------------------------------

/**
 * Map a Stripe checkout.session payload to our internal payment status.
 * Returns null for transitional states (no DB write).
 *
 * @param {object} session - the `data.object` from a checkout.session.* event
 * @returns {'confirmed' | 'failed' | 'expired' | null}
 */
export function mapStripeCheckoutStatus(session) {
  if (!session || typeof session !== 'object') return null;

  const status = session.status;
  const paymentStatus = session.payment_status;

  if (status === 'complete' && paymentStatus === 'paid') return 'confirmed';
  if (status === 'expired') return 'expired';

  // Stripe does not have a 'failed' checkout-session status; failures show
  // up as expired sessions or as charge.failed events on the payment_intent.
  // We treat the checkout-session level only.
  return null;
}
