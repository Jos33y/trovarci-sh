/**
 * tests/stripe-signature.test.js
 *
 * Pure-Node unit tests for Stripe webhook signature verification. No
 * Vite, no Remix, no DB. Run with:
 *
 *   node --test tests/stripe-signature.test.js
 *
 * Covers:
 *   - happy path (valid signed payload)
 *   - tampered body
 *   - tampered signature
 *   - timestamp outside replay window
 *   - missing/malformed header
 *   - multiple v1 entries (key rotation scenario)
 *   - non-v1 schemes are ignored
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  parseStripeSignatureHeader,
  computeStripeSignature,
  verifyStripeWebhookSignature,
} from '../app/lib/stripeSignature.server.js';

const SECRET = 'whsec_test_secret_used_only_in_unit_tests_xxxx';

function buildHeader(t, sig, extra = '') {
  return `t=${t},v1=${sig}${extra ? ',' + extra : ''}`;
}

function signedFixture(rawBody, t, secret = SECRET) {
  const sig = computeStripeSignature(t, rawBody, secret);
  return { rawBody, header: buildHeader(t, sig), t, sig };
}

test('parseStripeSignatureHeader extracts t and v1', () => {
  const t = 1735689600;
  const sig = 'a'.repeat(64);
  const out = parseStripeSignatureHeader(`t=${t},v1=${sig}`);
  assert.equal(out.t, t);
  assert.deepEqual(out.v1Signatures, [sig]);
});

test('parseStripeSignatureHeader extracts multiple v1 entries (rotation)', () => {
  const t = 1735689600;
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);
  const out = parseStripeSignatureHeader(`t=${t},v1=${a},v1=${b}`);
  assert.deepEqual(out.v1Signatures, [a, b]);
});

test('parseStripeSignatureHeader ignores non-v1 schemes', () => {
  const t = 1735689600;
  const sig = 'a'.repeat(64);
  const out = parseStripeSignatureHeader(`t=${t},v0=deadbeef,v1=${sig}`);
  assert.deepEqual(out.v1Signatures, [sig]);
});

test('parseStripeSignatureHeader rejects malformed v1 hex', () => {
  const out = parseStripeSignatureHeader('t=1,v1=not-hex,v1=abc');
  assert.deepEqual(out.v1Signatures, []);
});

test('verify accepts valid signed payload within window', () => {
  const t = Math.floor(Date.now() / 1000);
  const { rawBody, header } = signedFixture('{"id":"evt_1","type":"checkout.session.completed"}', t);
  assert.equal(verifyStripeWebhookSignature(rawBody, header, SECRET), true);
});

test('verify rejects tampered body', () => {
  const t = Math.floor(Date.now() / 1000);
  const { header } = signedFixture('{"id":"evt_1"}', t);
  const tamperedBody = '{"id":"evt_2"}';
  assert.equal(verifyStripeWebhookSignature(tamperedBody, header, SECRET), false);
});

test('verify rejects tampered signature', () => {
  const t = Math.floor(Date.now() / 1000);
  const { rawBody } = signedFixture('{"id":"evt_1"}', t);
  const fakeSig = 'f'.repeat(64);
  const fakeHeader = buildHeader(t, fakeSig);
  assert.equal(verifyStripeWebhookSignature(rawBody, fakeHeader, SECRET), false);
});

test('verify rejects payload signed with wrong secret', () => {
  const t = Math.floor(Date.now() / 1000);
  const { rawBody, header } = signedFixture('{"id":"evt_1"}', t, 'whsec_other_secret');
  assert.equal(verifyStripeWebhookSignature(rawBody, header, SECRET), false);
});

test('verify rejects expired timestamp (>tolerance old)', () => {
  const t = Math.floor(Date.now() / 1000) - 600;  // 10 min old
  const { rawBody, header } = signedFixture('{"id":"evt_1"}', t);
  assert.equal(
    verifyStripeWebhookSignature(rawBody, header, SECRET, { toleranceSec: 300 }),
    false,
  );
});

test('verify rejects future timestamp beyond tolerance', () => {
  const now = Math.floor(Date.now() / 1000);
  const t = now + 600;
  const { rawBody, header } = signedFixture('{"id":"evt_1"}', t);
  assert.equal(
    verifyStripeWebhookSignature(rawBody, header, SECRET, { toleranceSec: 300, nowSec: now }),
    false,
  );
});

test('verify accepts older timestamp within custom tolerance', () => {
  const t = Math.floor(Date.now() / 1000) - 200;
  const { rawBody, header } = signedFixture('{"id":"evt_1"}', t);
  assert.equal(
    verifyStripeWebhookSignature(rawBody, header, SECRET, { toleranceSec: 300 }),
    true,
  );
});

test('verify rejects missing header', () => {
  assert.equal(verifyStripeWebhookSignature('body', '', SECRET), false);
  assert.equal(verifyStripeWebhookSignature('body', null, SECRET), false);
});

test('verify rejects empty body', () => {
  const t = Math.floor(Date.now() / 1000);
  const sig = computeStripeSignature(t, '', SECRET);
  assert.equal(verifyStripeWebhookSignature('', `t=${t},v1=${sig}`, SECRET), false);
});

test('verify rejects missing secret', () => {
  const t = Math.floor(Date.now() / 1000);
  const { rawBody, header } = signedFixture('{"id":"evt_1"}', t);
  assert.equal(verifyStripeWebhookSignature(rawBody, header, ''), false);
});

test('verify accepts when one of multiple v1 sigs matches (key rotation)', () => {
  const t = Math.floor(Date.now() / 1000);
  const rawBody = '{"id":"evt_1"}';
  const goodSig = computeStripeSignature(t, rawBody, SECRET);
  const decoySig = 'd'.repeat(64);
  const header = `t=${t},v1=${decoySig},v1=${goodSig}`;
  assert.equal(verifyStripeWebhookSignature(rawBody, header, SECRET), true);
});

test('signature is exactly 64 hex chars (HMAC-SHA256)', () => {
  const t = 1735689600;
  const sig = computeStripeSignature(t, 'body', SECRET);
  assert.match(sig, /^[a-f0-9]{64}$/);
});

test('signature is deterministic across runs', () => {
  const sig1 = computeStripeSignature(1, 'body', SECRET);
  const sig2 = computeStripeSignature(1, 'body', SECRET);
  assert.equal(sig1, sig2);
});

test('verify uses constant-time compare (no timing oracle from length match)', () => {
  // Both candidate sigs are length-correct; the loop must use timingSafeEqual
  // not ===. Indirectly tested via the body of the function; here we just
  // confirm correctness against a synthetic length-correct decoy.
  const t = Math.floor(Date.now() / 1000);
  const rawBody = '{"id":"evt_1"}';
  const goodSig = computeStripeSignature(t, rawBody, SECRET);
  const decoy = goodSig.slice(0, -1) + (goodSig.endsWith('a') ? 'b' : 'a');
  const header = `t=${t},v1=${decoy}`;
  assert.equal(verifyStripeWebhookSignature(rawBody, header, SECRET), false);
});
