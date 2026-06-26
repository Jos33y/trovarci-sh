/**
 * POST /api/webhooks/stripe
 *
 * Stripe retries on non-2xx responses (with exponential backoff up to ~3
 * days). The response policy mirrors the Cryptomus webhook:
 *   - Return 200 for: successfully processed, signature failure (no oracle),
 *     unknown payment, ignored event types
 *   - Return 4xx/5xx ONLY for transient failures we want retried
 *
 * Security:
 *   - HMAC-SHA256 over raw body bytes per Stripe spec (verify-manually).
 *     React Router's request.text() preserves bytes; do NOT JSON.parse
 *     before verification.
 *   - 300-second replay window (Stripe SDK default) via timestamp in the
 *     Stripe-Signature header.
 *   - Optional IP allowlist via STRIPE_WEBHOOK_IP_ALLOWLIST env. Stripe
 *     publishes their webhook source IPs at
 *     https://stripe.com/docs/ips#webhook-notifications - the list rotates
 *     so allowlisting is brittle. Default behaviour: log source, do not
 *     enforce.
 *   - Per-IP rate limit (parity with Cryptomus webhook) caps log-flood DoS.
 *
 * Idempotency:
 *   - Stripe will resend events on any non-2xx, plus during normal
 *     operation can deliver the same event to multiple endpoints.
 *     completePayment() is the idempotency boundary - it locks the
 *     payments row, checks status, and grantCredits dedupes via
 *     reference_id. Safe to receive the same event N times.
 *
 * Events handled:
 *   - checkout.session.completed   -> map to confirmed/expired/null
 *   - checkout.session.expired     -> mark expired
 *   - charge.refunded              -> log only at launch (admin refund flow
 *                                     in Batch F handles refund credits)
 *   Everything else (account.*, payment_intent.*, invoice.*) is acknowledged
 *   with 200 and ignored.
 */

import {
  verifyStripeWebhookSignature,
  mapStripeCheckoutStatus,
} from '~/lib/stripe.server';
import {
  completePayment,
  markPaymentTerminal,
  getPaymentById,
} from '~/lib/payments.server';
import {
  getStripeCredentials,
  STRIPE_WEBHOOK_TOLERANCE_SEC,
  getPackage,
} from '~/utils/paymentsConfig.server';
import { recordEventSync } from '~/utils/analytics.server';
import { sendPaymentReceiptEmail } from '~/utils/email.server';

// ── IP allowlist (optional) ──
const ALLOWED_IPS = (process.env.STRIPE_WEBHOOK_IP_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Per-IP rate limit (parity with Cryptomus webhook) ──
// In-memory bucket. Per-process. 120 req/hour ceiling - Stripe sends
// webhooks at human pace; legitimate volume is one event per checkout
// state change.
const WEBHOOK_RL_WINDOW_MS = 60 * 60 * 1000;
const WEBHOOK_RL_MAX_HITS  = 120;
const ipBuckets = new Map();
let lastBucketGcAt = Date.now();
const BUCKET_GC_INTERVAL_MS = 5 * 60 * 1000;

function webhookRateLimit(ip) {
  if (!ip) return { allowed: true, retryAfter: null };

  const now = Date.now();

  if (now - lastBucketGcAt > BUCKET_GC_INTERVAL_MS) {
    const cutoff = now - WEBHOOK_RL_WINDOW_MS;
    for (const [k, v] of ipBuckets) {
      if (v.hits.length === 0 || v.hits[v.hits.length - 1] < cutoff) {
        ipBuckets.delete(k);
      }
    }
    lastBucketGcAt = now;
  }

  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { hits: [] };
    ipBuckets.set(ip, bucket);
  }

  const cutoff = now - WEBHOOK_RL_WINDOW_MS;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= WEBHOOK_RL_MAX_HITS) {
    const freesAt = bucket.hits[0] + WEBHOOK_RL_WINDOW_MS;
    const retryAfter = Math.max(1, Math.ceil((freesAt - now) / 1000));
    return { allowed: false, retryAfter };
  }

  bucket.hits.push(now);
  return { allowed: true, retryAfter: null };
}

function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

export async function loader() {
  return new Response('Method not allowed', { status: 405 });
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sourceIp = getClientIp(request);

  // ─── IP allowlist (optional) ──────────────────────────────────────
  if (ALLOWED_IPS.length > 0) {
    if (!sourceIp || !ALLOWED_IPS.includes(sourceIp)) {
      console.warn(`[stripe webhook] rejected request from disallowed IP: ${sourceIp || '(none)'}`);
      return ok200('ip_not_allowed');
    }
  } else if (sourceIp) {
    console.log(`[stripe webhook] inbound from ${sourceIp} (allowlist disabled)`);
  }

  // ─── Per-IP rate limit ────────────────────────────────────────────
  const rl = webhookRateLimit(sourceIp);
  if (!rl.allowed) {
    console.warn(`[stripe webhook] rate-limited IP: ${sourceIp} (retry in ${rl.retryAfter}s)`);
    return new Response(JSON.stringify({ ok: false, reason: 'rate_limited' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...(rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {}),
      },
    });
  }

  // ─── Read raw body (MUST be raw for HMAC) ─────────────────────────
  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return ok200('bad_body');
  }

  if (!rawBody) {
    return ok200('empty_body');
  }

  // ─── Verify signature ─────────────────────────────────────────────
  const signatureHeader = request.headers.get('stripe-signature');
  if (!signatureHeader) {
    console.warn('[stripe webhook] missing Stripe-Signature header');
    return ok200('missing_signature');
  }

  const { webhookSecret } = getStripeCredentials();
  const valid = verifyStripeWebhookSignature(
    rawBody,
    signatureHeader,
    webhookSecret,
    { toleranceSec: STRIPE_WEBHOOK_TOLERANCE_SEC },
  );
  if (!valid) {
    console.warn('[stripe webhook] signature verification failed');
    return ok200('invalid_signature');
  }

  // ─── Parse (now safe to trust) ────────────────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return ok200('malformed_json');
  }

  const eventType = event?.type;
  const eventObject = event?.data?.object;

  if (!eventType || !eventObject) {
    return ok200('missing_event_fields');
  }

  // Most Stripe event types are irrelevant to us. Filter early so the
  // critical paths stay narrow.
  const HANDLED_EVENTS = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
    'charge.refunded',
  ]);

  if (!HANDLED_EVENTS.has(eventType)) {
    return ok200('ignored_event');
  }

  // ─── checkout.session.* handling ─────────────────────────────────
  if (eventType.startsWith('checkout.session.')) {
    // client_reference_id is our payments.id (set on session create).
    // Falls back to metadata.payment_id if absent (defence in depth).
    const paymentId =
      eventObject.client_reference_id ||
      eventObject.metadata?.payment_id ||
      null;

    if (!paymentId) {
      console.warn(`[stripe webhook] ${eventType} missing payment id`);
      return ok200('no_payment_id');
    }

    let payment;
    try {
      payment = await getPaymentById(paymentId);
    } catch (err) {
      console.error('[stripe webhook] DB error on lookup:', err);
      return new Response('Internal error', { status: 500 });
    }

    if (!payment) {
      return ok200('unknown_payment');
    }

    if (payment.gateway !== 'stripe') {
      return ok200('wrong_gateway');
    }

    const mapped = mapStripeCheckoutStatus(eventObject);

    try {
      if (mapped === 'confirmed' || eventType === 'checkout.session.async_payment_succeeded') {
        // Stripe gives us amount_total in the smallest currency unit
        // (cents for USD), already as an integer. Convert to the
        // dollar string completePayment's underpayment defence expects.
        // amount_total reflects the actual paid amount including any
        // discounts/coupons, which is the right thing to compare against
        // our expected amount_usd_cents.
        const paidCents = Number.isFinite(eventObject.amount_total)
          ? eventObject.amount_total
          : null;
        const paymentAmountUsd = paidCents != null
          ? (paidCents / 100).toFixed(2)
          : null;

        const result = await completePayment(payment.id, {
          txid:              eventObject.payment_intent || null,
          payerCurrency:     (eventObject.currency || 'usd').toUpperCase(),
          payerAmount:       paymentAmountUsd,
          paymentAmountUsd,
          paymentMethodName: 'Stripe',
          rawWebhook:        event,
        });
        // Funnel: payment_confirmed (sync, never lost). Skip on replays.
        if (!result.alreadyCompleted && !result.underpaid) {
          await recordEventSync({
            event_type: 'payment_confirmed',
            session_hash: 'webhook',
            user_id: payment.user_id,
            path: '/api/webhooks/stripe',
            country: 'XX',
            device_class: 'unknown',
            is_bot: false,
            metadata: {
              gateway: 'stripe',
              payment_id: payment.id,
              credits: payment.credits,
              amount_usd_cents: payment.amount_usd_cents,
              currency: (eventObject.currency || 'usd').toUpperCase(),
            },
          }).catch((err) => console.error('[stripe webhook] funnel record failed:', err.message));

          // Fire-and-log receipt email. Failure must not break the 200 to Stripe.
          if (result.userEmail && result.transactionId) {
            const pkg = getPackage(payment.package_key);
            sendPaymentReceiptEmail({
              to:             result.userEmail,
              transactionId:  result.transactionId,
              credits:        payment.credits,
              amountUsd:      (payment.amount_usd_cents / 100).toFixed(2),
              paymentMethod:  'Stripe',
              packageName:    pkg?.name || payment.package_key,
              newBalance:     result.newBalance,
            }).catch((err) => console.error('[stripe webhook] receipt email failed:', err.message));
          }
        } else if (result.underpaid) {
          await recordEventSync({
            event_type: 'payment_failed',
            session_hash: 'webhook',
            user_id: payment.user_id,
            path: '/api/webhooks/stripe',
            country: 'XX',
            device_class: 'unknown',
            is_bot: false,
            metadata: {
              gateway: 'stripe',
              payment_id: payment.id,
              reason: 'underpayment',
              shortfall_cents: result.shortfallCents,
            },
          }).catch((err) => console.error('[stripe webhook] funnel record failed:', err.message));
        }
        return ok200('confirmed');
      }

      if (mapped === 'expired' || eventType === 'checkout.session.async_payment_failed') {
        const terminalStatus = mapped === 'expired' ? 'expired' : 'failed';
        await markPaymentTerminal(payment.id, terminalStatus, { rawWebhook: event });
        await recordEventSync({
          event_type: terminalStatus === 'expired' ? 'payment_abandoned' : 'payment_failed',
          session_hash: 'webhook',
          user_id: payment.user_id,
          path: '/api/webhooks/stripe',
          country: 'XX',
          device_class: 'unknown',
          is_bot: false,
          metadata: { gateway: 'stripe', payment_id: payment.id, status: terminalStatus },
        }).catch((err) => console.error('[stripe webhook] funnel record failed:', err.message));
        return ok200(terminalStatus);
      }

      // checkout.session.completed with payment_status != 'paid' (delayed
      // method) - we don't enable delayed methods so this should not
      // occur. Acknowledge and wait for the async_payment_* follow-up.
      return ok200('transitional');

    } catch (err) {
      console.error('[stripe webhook] processing error:', err);
      return new Response('Processing error', { status: 500 });
    }
  }

  // ─── charge.refunded ─────────────────────────────────────────────
  // Logged only at launch. Admin-initiated refund flow (Batch F) writes
  // the refund credit_transactions row through grantCredits / refundCredits.
  // A Stripe-side refund issued out-of-band still needs operator action
  // to write the matching ledger row, so we surface it loudly.
  if (eventType === 'charge.refunded') {
    const paymentIntent = eventObject.payment_intent || null;
    console.warn(`[stripe webhook] charge.refunded received for payment_intent=${paymentIntent}; admin review required`);
    return ok200('refund_logged');
  }

  return ok200('ignored');
}

function ok200(reason) {
  return new Response(JSON.stringify({ ok: true, reason }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
