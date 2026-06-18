/**
 * Pure Cryptomus signature primitives.
 *
 * Lives in its own file with zero Remix/app dependencies (only node:crypto)
 * so it can be unit-tested with bare Node:
 *
 *   node --test tests/cryptomus-signature.test.js
 *
 * The HTTP client (cryptomus.server.js) re-exports signBody and
 * verifyWebhookSignature from here, so existing callers keep working
 * without modification.
 *
 * Background on byte-level surgery (the P0-12 fix):
 *
 *   Cryptomus is a PHP shop. PHP's json_encode escapes forward slashes by
 *   default - "txid":"abc/def" is wire-encoded as "txid":"abc\/def".
 *   Node's JSON.stringify does NOT escape forward slashes.
 *
 *   The previous verifier did: parse(rawBody) -> delete sign -> stringify.
 *   That round-trip silently dropped slash escaping, producing a different
 *   byte sequence than what Cryptomus signed, leading to false signature
 *   mismatches on any payload containing "/" (URLs, IPFS hashes, paths in
 *   additional_data). It worked in production by coincidence - standard
 *   Cryptomus payment fields (UUIDs, hex txids, ISO codes) don't contain
 *   slashes - but the bomb was ticking.
 *
 *   The fix in verifyWebhookSignature: byte-level surgery on the raw body
 *   string. Find the "sign":"<32-hex>" substring, remove it cleanly along
 *   with one adjacent comma, leave every other byte exactly as Cryptomus
 *   sent it. No JSON round-trip. The signature is computed against the
 *   exact bytes the sender computed it against, regardless of how they
 *   chose to encode the JSON.
 *
 *   See https://doc.cryptomus.com/merchant-api/payments/webhook for
 *   Cryptomus's documented JS workaround. Our approach is stronger because
 *   it's independent of any current OR future encoder differences.
 *
 * Reference: https://doc.cryptomus.com/merchant-api/payments/webhook
 */

import crypto from 'node:crypto';

/**
 * Compute the Cryptomus signature over a raw JSON body string.
 *
 * Used for OUTBOUND requests where we control the serialization. The
 * webhook verification path does NOT use this function - it operates on
 * the inbound raw bytes directly via verifyWebhookSignature below.
 *
 * @param {string} bodyJson - The exact body string (not a re-serialized copy)
 * @param {string} apiKey  - Payment API key
 * @returns {string} 32-char hex MD5
 */
export function signBody(bodyJson, apiKey) {
  const base64 = Buffer.from(bodyJson, 'utf8').toString('base64');
  return crypto.createHash('md5').update(base64 + apiKey).digest('hex');
}

/**
 * Strip the `sign` field from a raw JSON body via byte-level surgery.
 *
 * Returns { sign, stripped } on success, null if no sign field present
 * or if the body is structurally suspicious (multiple sign fields).
 *
 * Why byte surgery and not JSON.parse + delete + stringify:
 *   The round-trip approach loses information about how the original
 *   was encoded (slash escaping, key order, whitespace). The signer
 *   computed MD5 over the exact bytes they sent, not over a Node-
 *   re-serialized version. To match, we have to preserve those bytes.
 *
 * Why this is safe:
 *   The pattern "sign" followed by ":" only appears at JSON key positions.
 *   Inside a string value, an unescaped " would terminate the string.
 *   So `"sign"\s*:` cannot match anything except a key declaration.
 *   The 32-char hex value pattern eliminates further ambiguity - even if
 *   a string value contained the literal text "sign":"..." (with escaped
 *   quotes), the unescaped quote pattern wouldn't match.
 *
 * Defensive check: if the stripped result still contains a sign field,
 * we refuse - a payload with two sign fields is a forged or malformed
 * request and should not be trusted.
 *
 * @param {string} rawBody - Exact bytes received from the wire
 * @returns {{sign: string, stripped: string} | null}
 */
function stripSignField(rawBody) {
  // 32-char lowercase hex, the MD5 output format Cryptomus uses.
  // Anchored quotes prevent partial matches against substring values.
  const SIGN_RE = /"sign"\s*:\s*"([a-f0-9]{32})"/;

  const match = rawBody.match(SIGN_RE);
  if (!match) return null;

  const sign = match[1];
  const matchStart = match.index;
  const matchEnd   = matchStart + match[0].length;

  // Find the nearest non-whitespace char to the LEFT of the match.
  // If it's a comma, we have a leading separator we should remove.
  let leftCommaIdx = -1;
  for (let i = matchStart - 1; i >= 0; i--) {
    const c = rawBody[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    if (c === ',') leftCommaIdx = i;
    break;
  }

  // Same logic to the RIGHT.
  let rightCommaIdx = -1;
  for (let i = matchEnd; i < rawBody.length; i++) {
    const c = rawBody[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    if (c === ',') rightCommaIdx = i;
    break;
  }

  // Compose the stripped body. Remove exactly one comma to keep the JSON
  // structurally valid - removing both would produce {"a",,"b"} (broken),
  // removing neither would produce {"a","b"} (also broken if sign was
  // between them).
  let stripped;
  if (leftCommaIdx >= 0) {
    stripped = rawBody.slice(0, leftCommaIdx) + rawBody.slice(matchEnd);
  } else if (rightCommaIdx >= 0) {
    stripped = rawBody.slice(0, matchStart) + rawBody.slice(rightCommaIdx + 1);
  } else {
    // sign was the only field. Removing it leaves "{}" or similar.
    stripped = rawBody.slice(0, matchStart) + rawBody.slice(matchEnd);
  }

  // Defensive: a hostile or malformed payload with two sign fields would
  // make the verification ambiguous. Reject.
  if (SIGN_RE.test(stripped)) return null;

  return { sign, stripped };
}

/**
 * Verify a webhook signature against the raw body bytes.
 *
 * Returns true/false. Never throws on untrusted input.
 */
export function verifyWebhookSignature(rawBody, apiKey) {
  if (typeof rawBody !== 'string' || rawBody.length === 0) return false;
  if (typeof apiKey !== 'string' || apiKey.length === 0) return false;

  const stripped = stripSignField(rawBody);
  if (!stripped) return false;

  const expectedSign = signBody(stripped.stripped, apiKey);

  // Constant-time compare. Both buffers must be equal length or Node
  // throws - we control both via hex parse so they're always 16 bytes.
  let a, b;
  try {
    a = Buffer.from(stripped.sign, 'hex');
    b = Buffer.from(expectedSign, 'hex');
  } catch {
    return false;
  }
  if (a.length !== 16 || b.length !== 16) return false;
  return crypto.timingSafeEqual(a, b);
}

// Exported for tests. Not part of the public API - do not use elsewhere.
export const __test__ = { stripSignField };
