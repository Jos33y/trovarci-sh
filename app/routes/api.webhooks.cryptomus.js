/**
 * POST /api/webhooks/cryptomus
 *
 * Cryptomus retries on non-2xx responses, so:
 *   - Return 200 for: successfully processed, invalid payload (no point retrying),
 *     unknown payment (we already have it or it's not ours)
 *   - Return 4xx/5xx ONLY for transient failures (DB down, Cryptomus platform
 *     glitch) that warrant a retry
 *
 * Security:
 *   - Signature is verified against the RAW body bytes via byte-level
 *     surgery (see cryptomus.server.js for the rationale). React Router
 *     gives us `request.text()` which preserves the exact bytes.
 *   - If signature verification fails, we return 200 but do nothing. Not
 *     401 - we don't want to hand an attacker a probe oracle.
 *   - Optional IP allowlist via CRYPTOMUS_WEBHOOK_IP_ALLOWLIST env var
 *     (comma-separated). When set, requests from other IPs are silently
 *     200-acknowledged but not processed. Cryptomus's documented webhook
 *     source is 91.227.144.54. Default behaviour: do not enforce, but
 *     log the source IP so you can verify and enable.
 *
 * Idempotency:
 *   - Cryptomus can send the same webhook multiple times (retries, their
 *     internal replays). completePayment() checks the payment status and
 *     grantCredits uses reference_id to prevent double-crediting. Safe to
 *     receive the same event 1000 times.
 */

import { verifyWebhookSignature, mapCryptomusStatus } from '~/lib/cryptomus.server';
import {
  completePayment,
  markPaymentTerminal,
  getPaymentById,
} from '~/lib/payments.server';
import { getCryptomusCredentials } from '~/utils/paymentsConfig.server';
import { recordEventSync } from '~/utils/analytics.server';

// IP allowlist parsed once at module load. Empty = no enforcement.
// Cryptomus documented source: 91.227.144.54.
const ALLOWED_IPS = (process.env.CRYPTOMUS_WEBHOOK_IP_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Per-IP rate limit (P1-18) ──
// Defence against log-flood DoS: even a request that fails the allowlist
// or signature check still hits our log pipeline. An attacker who
// discovers the endpoint could send thousands of requests per minute
// to fill our logs and run up our log-storage bill. This token
// bucket caps any single source IP at a sensible ceiling. Cryptomus
// itself sends webhooks at human pace (one per payment status change);
// 120/hour is two orders of magnitude above realistic legitimate traffic.
//
// In-memory bucket. Per-process, not distributed. Multi-node deployment
// would let an attacker get 120*N before being throttled. Acceptable for
// our scale - the cost of cross-process coordination would dwarf the
// upside until we are way past first 1k customers.
const WEBHOOK_RL_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const WEBHOOK_RL_MAX_HITS  = 120;
const ipBuckets = new Map();
let lastBucketGcAt = Date.now();
const BUCKET_GC_INTERVAL_MS = 5 * 60 * 1000;

function webhookRateLimit(ip) {
  if (!ip) return { allowed: true, retryAfter: null };  // no IP visible -> can't limit; allow

  const now = Date.now();

  // GC stale buckets so the Map stays bounded.
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

  // Drop hits older than the window.
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
  // Coolify / nginx fronts the app, so X-Forwarded-For is authoritative.
  // Take the LEFTMOST entry - that's the original client per RFC 7239.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

export async function loader() {
  // GET to this URL serves no purpose.
  return new Response('Method not allowed', { status: 405 });
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sourceIp = getClientIp(request);

  // ─── IP allowlist (optional, env-toggleable) ──────────────────────
  if (ALLOWED_IPS.length > 0) {
    if (!sourceIp || !ALLOWED_IPS.includes(sourceIp)) {
      console.warn(`[cryptomus webhook] rejected request from disallowed IP: ${sourceIp || '(none)'}`);
      // Return 200 to avoid retry-storm from an attacker probing the
      // endpoint. Logged so we see attempts.
      return ok200('ip_not_allowed');
    }
  } else {
    // Allowlist not enforced. Log the source IP for visibility so the
    // operator can verify what Cryptomus is actually using before
    // enabling enforcement.
    if (sourceIp) {
      console.log(`[cryptomus webhook] inbound from ${sourceIp} (allowlist disabled)`);
    }
  }

  // ─── Per-IP rate limit (P1-18) ────────────────────────────────────
  // Caps log-flood DoS even if an attacker survives the allowlist (e.g.
  // when the allowlist is off, the default state). Cheap to evaluate -
  // O(1) Map lookup + small array filter on the hot path.
  const rl = webhookRateLimit(sourceIp);
  if (!rl.allowed) {
    console.warn(`[cryptomus webhook] rate-limited IP: ${sourceIp} (retry in ${rl.retryAfter}s)`);
    return new Response(JSON.stringify({ ok: false, reason: 'rate_limited' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...(rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {}),
      },
    });
  }

  // ─── Read raw body (MUST be raw for signature verification) ───────
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
  const { paymentApiKey } = getCryptomusCredentials();
  const valid = verifyWebhookSignature(rawBody, paymentApiKey);
  if (!valid) {
    // eslint-disable-next-line no-console
    console.warn('[cryptomus webhook] signature verification failed');
    return ok200('invalid_signature');
  }

  // ─── Parse (now safe to trust) ────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return ok200('malformed_json');
  }

  const type     = payload.type;               // 'payment' for invoices
  const orderId  = payload.order_id;
  const status   = payload.status;
  const isFinal  = payload.is_final === true;

  if (type !== 'payment') {
    // Not a payment invoice webhook (could be payout). Acknowledge.
    return ok200('ignored_type');
  }

  if (!orderId || !status) {
    return ok200('missing_fields');
  }

  // ─── Look up payment ──────────────────────────────────────────────
  let payment;
  try {
    payment = await getPaymentById(orderId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cryptomus webhook] DB error on lookup:', err);
    return new Response('Internal error', { status: 500 }); // triggers retry
  }

  if (!payment) {
    // Order ID does not match anything in our DB. Could be a test webhook,
    // could be misconfigured merchant. Acknowledge without processing.
    return ok200('unknown_payment');
  }

  if (payment.gateway !== 'cryptomus') {
    return ok200('wrong_gateway');
  }

  // ─── Map status and act ──────────────────────────────────────────
  const mappedStatus = mapCryptomusStatus(status, isFinal);

  try {
    if (mappedStatus === 'confirmed') {
      const result = await completePayment(payment.id, {
        txid:             payload.txid ?? null,
        payerCurrency:    payload.payer_currency ?? null,
        payerAmount:      payload.payer_amount ?? null,
        // payment_amount_usd is the canonical USD value of what the payer
        // actually paid (after Cryptomus's currency conversion). Used by
        // completePayment for underpayment defence-in-depth (P1-16).
        paymentAmountUsd: payload.payment_amount_usd ?? null,
        paymentMethodName: 'Cryptomus',
        rawWebhook: payload,
      });
      // Funnel event: payment_confirmed (sync = guaranteed). Skip on
      // already-completed replays so we don't double-count revenue.
      if (!result.alreadyCompleted && !result.underpaid) {
        await recordEventSync({
          event_type: 'payment_confirmed',
          session_hash: 'webhook',
          user_id: payment.user_id,
          path: '/api/webhooks/cryptomus',
          country: 'XX',
          device_class: 'unknown',
          is_bot: false,
          metadata: {
            gateway: 'cryptomus',
            payment_id: payment.id,
            credits: payment.credits,
            amount_usd_cents: payment.amount_usd_cents,
            payer_currency: payload.payer_currency ?? null,
          },
        }).catch((err) => console.error('[cryptomus webhook] funnel record failed:', err.message));
      } else if (result.underpaid) {
        await recordEventSync({
          event_type: 'payment_failed',
          session_hash: 'webhook',
          user_id: payment.user_id,
          path: '/api/webhooks/cryptomus',
          country: 'XX',
          device_class: 'unknown',
          is_bot: false,
          metadata: {
            gateway: 'cryptomus',
            payment_id: payment.id,
            reason: 'underpayment',
            shortfall_cents: result.shortfallCents,
          },
        }).catch((err) => console.error('[cryptomus webhook] funnel record failed:', err.message));
      }
      return ok200('confirmed');
    }

    if (mappedStatus === 'failed' || mappedStatus === 'expired') {
      await markPaymentTerminal(payment.id, mappedStatus, { rawWebhook: payload });
      await recordEventSync({
        event_type: mappedStatus === 'expired' ? 'payment_abandoned' : 'payment_failed',
        session_hash: 'webhook',
        user_id: payment.user_id,
        path: '/api/webhooks/cryptomus',
        country: 'XX',
        device_class: 'unknown',
        is_bot: false,
        metadata: { gateway: 'cryptomus', payment_id: payment.id, status: mappedStatus },
      }).catch((err) => console.error('[cryptomus webhook] funnel record failed:', err.message));
      return ok200(mappedStatus);
    }

    if (mappedStatus === 'refunded') {
      // Refund flow - we'd write a refund credit_transaction here. Keeping
      // as a TODO for admin-initiated refunds (Section 08).
      // eslint-disable-next-line no-console
      console.log('[cryptomus webhook] refund status received, logging only:', payment.id);
      return ok200('refund_logged');
    }

    // Transitional status (awaiting_payment, confirm_check). Nothing to do.
    return ok200('transitional');

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cryptomus webhook] processing error:', err);
    // Trigger retry - transient failure
    return new Response('Processing error', { status: 500 });
  }
}

// -----------------------------------------------------------------------
// Response helper
// -----------------------------------------------------------------------

function ok200(reason) {
  return new Response(JSON.stringify({ ok: true, reason }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
