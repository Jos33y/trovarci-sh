/**
 * Pure Stripe webhook signature primitives.
 *
 * Lives in its own file with zero Remix/app dependencies (only node:crypto)
 * so it can be unit-tested with bare Node:
 *
 *   node --test tests/stripe-signature.test.js
 *
 * Stripe's webhook signing scheme (v1):
 *
 *   1. Stripe sends header `Stripe-Signature: t=<unix-seconds>,v1=<hex>,...`
 *      where the comma-separated parts are key=value pairs. Multiple v1
 *      signatures may appear (during a key rotation). Other schemes (v0)
 *      may also appear; we ignore everything except v1.
 *
 *   2. The signed payload is the literal string `${t}.${rawBody}` where
 *      `t` is the timestamp from the header and `rawBody` is the EXACT
 *      bytes of the request body. JSON.parse + JSON.stringify will not
 *      round-trip byte-identical and will silently invalidate every
 *      signature; the route must hand us `request.text()`.
 *
 *   3. Compute HMAC-SHA256 of that string keyed by the webhook secret
 *      (env STRIPE_WEBHOOK_SECRET, the value of the form `whsec_...`).
 *      Compare hex-encoded against each v1 in the header.
 *
 *   4. Reject if no v1 matches OR if `t` is older than tolerance
 *      (default 300 seconds, the value Stripe's own SDK uses). The
 *      timestamp check stops a captured webhook from being replayed days
 *      later by an attacker who somehow got hold of the raw body.
 *
 * All comparisons use crypto.timingSafeEqual to keep the signature check
 * constant-time. Length-mismatched candidates are discarded before the
 * comparison so timingSafeEqual never throws.
 *
 * Reference: https://stripe.com/docs/webhooks#verify-manually
 */

import crypto from 'node:crypto';

const DEFAULT_TOLERANCE_SEC = 300;

/**
 * Parse a Stripe-Signature header into its components.
 *
 * @param {string} header
 * @returns {{ t: number | null, v1Signatures: string[] }}
 */
export function parseStripeSignatureHeader(header) {
  if (typeof header !== 'string' || header.length === 0) {
    return { t: null, v1Signatures: [] };
  }

  let t = null;
  const v1Signatures = [];

  const parts = header.split(',');
  for (const raw of parts) {
    const idx = raw.indexOf('=');
    if (idx === -1) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key === 't') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n)) t = n;
    } else if (key === 'v1') {
      // Hex sigs only - v0 (deprecated) and unknown schemes are ignored.
      // 64 hex chars = HMAC-SHA256 output. Reject anything else outright
      // so a malformed or mis-scheme signature never reaches the
      // constant-time compare.
      if (/^[a-f0-9]{64}$/i.test(value)) {
        v1Signatures.push(value.toLowerCase());
      }
    }
  }

  return { t, v1Signatures };
}

/**
 * Compute the expected v1 signature for a given timestamp + raw body.
 *
 * @param {number} t - Unix seconds (the `t` from the Stripe-Signature header)
 * @param {string} rawBody - EXACT request body bytes (request.text())
 * @param {string} webhookSecret - whsec_... value from Stripe dashboard
 * @returns {string} 64-char lowercase hex
 */
export function computeStripeSignature(t, rawBody, webhookSecret) {
  const signedPayload = `${t}.${rawBody}`;
  return crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
}

/**
 * Verify a Stripe webhook signature.
 *
 * @param {string} rawBody - EXACT request body bytes
 * @param {string} signatureHeader - value of the Stripe-Signature header
 * @param {string} webhookSecret - whsec_... value
 * @param {{ toleranceSec?: number, nowSec?: number }} [opts]
 *        toleranceSec: max allowed clock drift (default 300)
 *        nowSec: override current time (for tests)
 * @returns {boolean}
 */
export function verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret, opts = {}) {
  if (typeof rawBody !== 'string' || rawBody.length === 0) return false;
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) return false;
  if (typeof webhookSecret !== 'string' || webhookSecret.length === 0) return false;

  const toleranceSec = Number.isFinite(opts.toleranceSec) ? opts.toleranceSec : DEFAULT_TOLERANCE_SEC;
  const nowSec = Number.isFinite(opts.nowSec) ? opts.nowSec : Math.floor(Date.now() / 1000);

  const { t, v1Signatures } = parseStripeSignatureHeader(signatureHeader);
  if (t === null || v1Signatures.length === 0) return false;

  // Replay window check. Reject a signed payload whose timestamp is more
  // than `toleranceSec` away from now (in either direction). The negative
  // direction matters less in practice but a clock-skewed attacker server
  // sending future timestamps shouldn't get a free pass.
  if (Math.abs(nowSec - t) > toleranceSec) return false;

  const expected = computeStripeSignature(t, rawBody, webhookSecret);
  const expectedBuf = Buffer.from(expected, 'hex');

  for (const candidate of v1Signatures) {
    const candidateBuf = Buffer.from(candidate, 'hex');
    if (candidateBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(candidateBuf, expectedBuf)) return true;
  }
  return false;
}
