// Polar client: creates hosted checkouts for credit packs and verifies webhook signatures (Standard Webhooks).

import crypto from 'node:crypto';
import { POLAR_API_BASE, getPolarCredentials, getPublicUrl } from '~/utils/paymentsConfig.server';

const WEBHOOK_TOLERANCE_SEC = 300;
const REQUEST_TIMEOUT_MS = 15_000;

export async function createPolarCheckout({ paymentId, productId, amountUsdCents, isCustom, userId, customerEmail, packageKey, credits }) {
  const { accessToken } = getPolarCredentials();
  const base = getPublicUrl();

  const body = {
    products: [productId],
    success_url: `${base}/credits/pending/${paymentId}`,
    return_url: `${base}/credits`,
    external_customer_id: userId,
    customer_email: customerEmail,
    allow_discount_codes: false,
    metadata: { payment_id: paymentId, package_key: packageKey, credits },
  };
  // Custom amounts reuse one product with a price set for this checkout only.
  if (isCustom) {
    body.prices = { [productId]: [{ amount_type: 'fixed', price_amount: amountUsdCents, price_currency: 'usd' }] };
  }

  const res = await fetch(`${POLAR_API_BASE}/v1/checkouts/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Polar checkout failed: HTTP ${res.status} ${text.slice(0, 300)}`);

  const checkout = JSON.parse(text);
  if (!checkout?.id || !checkout?.url) throw new Error('Polar checkout response missing id or url');
  return { id: checkout.id, url: checkout.url };
}

// Polar signs `${id}.${timestamp}.${body}` with HMAC-SHA256. Secrets made before 8 September 2026
// use the UTF-8 bytes of the whole whsec_ string as the key; newer ones use the base64 part decoded.
// Both are tried, as Polar's own SDK does.
function signingKeys(secret) {
  const keys = [Buffer.from(secret, 'utf8')];
  const remainder = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const decoded = Buffer.from(remainder, 'base64');
  if (decoded.length > 0 && !decoded.equals(keys[0])) keys.push(decoded);
  return keys;
}

export function verifyPolarWebhook(rawBody, headers) {
  const { webhookSecret } = getPolarCredentials();
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TOLERANCE_SEC) return false;

  const signed = Buffer.from(`${id}.${Math.floor(ts)}.${rawBody}`, 'utf8');
  const expected = signingKeys(webhookSecret).map((key) => crypto.createHmac('sha256', key).update(signed).digest());

  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (expected.some((e) => e.length === given.length && crypto.timingSafeEqual(e, given))) return true;
  }
  return false;
}
