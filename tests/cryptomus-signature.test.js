/**
 * Unit tests for Cryptomus signature verification (P0-12).
 *
 * Run: node --test tests/cryptomus-signature.test.js
 *
 * These tests use only Node's built-in test runner (node:test) and node:assert,
 * so they require no dev dependencies. Node 20+ recommended.
 *
 * The tests cover:
 *   1. Self-roundtrip: sign with our own signBody, verify, expect pass
 *   2. Slash escaping: payloads with "/" verify correctly (the actual P0-12 fix)
 *   3. Position independence: sign as first/middle/last/only key all verify
 *   4. Whitespace tolerance: pretty-printed JSON verifies
 *   5. Tampering: any byte change in the body fails verification
 *   6. Wrong signature: random sign value fails verification
 *   7. Wrong key: correct sign with wrong key fails verification
 *   8. Defensive cases: empty body, malformed body, missing sign, double sign
 *
 * The tests do NOT use real Cryptomus payloads/keys. They use synthetic
 * payloads signed with our own signBody function, which proves that:
 *   (a) the verifier accepts what the signer produced
 *   (b) the verifier rejects everything else
 *   (c) byte-level surgery preserves slash escaping (the bug fix)
 *
 * To validate against the LIVE Cryptomus service, use Cryptomus's
 * "Testing webhook" API endpoint (see docs) - it will deliver a signed
 * test webhook to your url_callback that this verifier should accept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Import the module under test. Pure signature primitives live in their
// own file specifically so they're testable under bare Node (no Vite ~/
// alias resolution at test time). The HTTP client (cryptomus.server.js)
// re-exports them, so production code is unchanged.
import {
  signBody,
  verifyWebhookSignature,
  __test__,
} from '../app/lib/cryptomusSignature.server.js';

const { stripSignField } = __test__;

// Helper: sign a body using the same algorithm Cryptomus uses, for use as
// test fixtures. Mirrors signBody.
function signFixture(bodyJson, apiKey) {
  return signBody(bodyJson, apiKey);
}

// Helper: build a signed webhook body. Returns the full JSON string with
// sign appended, plus the bare body without sign.
function buildSignedBody(payloadObj, apiKey) {
  const bare = JSON.stringify(payloadObj);
  const sign = signFixture(bare, apiKey);
  // Insert sign as the LAST key, the way Cryptomus does in their docs example
  const withSign = bare.replace(/}$/, `,"sign":"${sign}"}`);
  return { withSign, bare, sign };
}

const KEY = 'test_payment_api_key_DO_NOT_USE_IN_PROD';

// ─── Core happy path ─────────────────────────────────────────────────

test('verify accepts a body signed with our own signBody', () => {
  const { withSign } = buildSignedBody({
    type: 'payment',
    uuid: '62f88b36-a9d5-4fa6-aa26-e040c3dbf26d',
    order_id: '97a75bf8eda5cca41ba9d2e104840fcd',
    amount: '3.00000000',
    status: 'paid',
    is_final: true,
  }, KEY);

  assert.equal(verifyWebhookSignature(withSign, KEY), true);
});

// ─── The actual P0-12 bug fix: slashes in values ─────────────────────

test('verify accepts payloads containing forward slashes (P0-12 fix)', () => {
  // The previous parse-then-stringify verifier would FAIL this test because
  // round-tripping through Node's JSON.stringify drops the slash escaping
  // that PHP's json_encode applies. The byte-surgery verifier preserves
  // every byte that wasn't part of the sign field.
  const bareWithSlashes = JSON.stringify({
    type: 'payment',
    txid: 'abc/def/ghi',
    additional_data: '{"customer_email":"user@example.com","note":"a/b"}',
    status: 'paid',
  });
  const sign = signFixture(bareWithSlashes, KEY);
  const withSign = bareWithSlashes.replace(/}$/, `,"sign":"${sign}"}`);

  assert.equal(verifyWebhookSignature(withSign, KEY), true);
});

test('verify accepts payloads with PHP-style escaped slashes', () => {
  // Simulating what real Cryptomus sends: the raw body has slashes escaped
  // as \/ (because PHP json_encode does that by default). Our verifier
  // must NOT touch those bytes - they're part of what was signed.
  const rawBodyWithEscapedSlashes = '{"type":"payment","txid":"abc\\/def","status":"paid"}';
  const expectedSign = signFixture(rawBodyWithEscapedSlashes, KEY);
  const withSign = rawBodyWithEscapedSlashes.replace(
    /}$/,
    `,"sign":"${expectedSign}"}`
  );

  assert.equal(verifyWebhookSignature(withSign, KEY), true);
});

// ─── Sign field position independence ────────────────────────────────

test('verify accepts sign as the LAST key', () => {
  const body = '{"a":"x","b":"y","sign":"' + signFixture('{"a":"x","b":"y"}', KEY) + '"}';
  assert.equal(verifyWebhookSignature(body, KEY), true);
});

test('verify accepts sign as the FIRST key', () => {
  const sign = signFixture('{"a":"x","b":"y"}', KEY);
  const body = '{"sign":"' + sign + '","a":"x","b":"y"}';
  assert.equal(verifyWebhookSignature(body, KEY), true);
});

test('verify accepts sign as a MIDDLE key', () => {
  const sign = signFixture('{"a":"x","b":"y"}', KEY);
  const body = '{"a":"x","sign":"' + sign + '","b":"y"}';
  assert.equal(verifyWebhookSignature(body, KEY), true);
});

test('verify accepts sign as the ONLY key (degenerate case)', () => {
  const sign = signFixture('{}', KEY);
  const body = '{"sign":"' + sign + '"}';
  assert.equal(verifyWebhookSignature(body, KEY), true);
});

// ─── Whitespace ──────────────────────────────────────────────────────

test('verify accepts pretty-printed JSON with whitespace', () => {
  // Sign computed against the exact pretty-printed bytes (minus sign field).
  const pretty = `{
  "type": "payment",
  "uuid": "62f88b36",
  "status": "paid"
}`;
  const sign = signFixture(pretty, KEY);
  // Insert sign before the closing brace, with whitespace preserved.
  const withSign = pretty.replace(/\n}$/, `,\n  "sign": "${sign}"\n}`);

  assert.equal(verifyWebhookSignature(withSign, KEY), true);
});

// ─── Negative cases: tampering ───────────────────────────────────────

test('verify rejects tampered amount field', () => {
  const { withSign } = buildSignedBody({
    type: 'payment',
    amount: '3.00',
    status: 'paid',
  }, KEY);
  // Attacker bumps amount AFTER signing
  const tampered = withSign.replace('"3.00"', '"30.00"');

  assert.equal(verifyWebhookSignature(tampered, KEY), false);
});

test('verify rejects tampered sign value', () => {
  const { withSign } = buildSignedBody({
    type: 'payment',
    status: 'paid',
  }, KEY);
  // Replace the last hex char of the signature
  const tampered = withSign.replace(/"sign":"([a-f0-9]{31})[a-f0-9]"/, '"sign":"$1z"');

  assert.equal(verifyWebhookSignature(tampered, KEY), false);
});

test('verify rejects with wrong API key', () => {
  const { withSign } = buildSignedBody({ type: 'payment', status: 'paid' }, KEY);
  assert.equal(verifyWebhookSignature(withSign, 'wrong_key_xxx'), false);
});

// ─── Negative cases: structural ──────────────────────────────────────

test('verify rejects empty body', () => {
  assert.equal(verifyWebhookSignature('', KEY), false);
});

test('verify rejects null and undefined', () => {
  assert.equal(verifyWebhookSignature(null, KEY), false);
  assert.equal(verifyWebhookSignature(undefined, KEY), false);
});

test('verify rejects body with no sign field', () => {
  assert.equal(verifyWebhookSignature('{"type":"payment"}', KEY), false);
});

test('verify rejects body with non-hex sign value', () => {
  // Not 32 lowercase hex chars - regex won't match, treated as no sign
  assert.equal(verifyWebhookSignature('{"sign":"not_a_hash"}', KEY), false);
  assert.equal(verifyWebhookSignature('{"sign":"ABCDEF1234567890ABCDEF1234567890"}', KEY), false);
});

test('verify rejects body with two sign fields (defensive)', () => {
  // Hostile payload trying to trick us - the regex matches only one, but the
  // post-strip check finds the second and returns null.
  const body = '{"sign":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sign":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}';
  assert.equal(verifyWebhookSignature(body, KEY), false);
});

test('verify rejects empty API key', () => {
  const { withSign } = buildSignedBody({ type: 'payment' }, KEY);
  assert.equal(verifyWebhookSignature(withSign, ''), false);
});

// ─── Direct stripSignField tests ─────────────────────────────────────

test('stripSignField removes sign with leading comma', () => {
  const body = '{"a":"x","sign":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';
  const result = stripSignField(body);
  assert.equal(result.sign, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.stripped, '{"a":"x"}');
});

test('stripSignField removes sign with trailing comma', () => {
  const body = '{"sign":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","a":"x"}';
  const result = stripSignField(body);
  assert.equal(result.sign, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.stripped, '{"a":"x"}');
});

test('stripSignField handles sign-only payload', () => {
  const body = '{"sign":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';
  const result = stripSignField(body);
  assert.equal(result.sign, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.stripped, '{}');
});

test('stripSignField returns null when no sign field present', () => {
  assert.equal(stripSignField('{"a":"x"}'), null);
  assert.equal(stripSignField(''), null);
});

test('stripSignField preserves slash escaping in body', () => {
  const body = '{"url":"http:\\/\\/example.com\\/path","sign":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';
  const result = stripSignField(body);
  assert.equal(result.stripped, '{"url":"http:\\/\\/example.com\\/path"}');
});

// ─── End-to-end: simulate a Cryptomus payment webhook ────────────────

test('end-to-end: realistic Cryptomus payment webhook structure', () => {
  // Built to mirror the example payload from
  // https://doc.cryptomus.com/merchant-api/payments/webhook
  // We sign it ourselves with KEY since we don't have Cryptomus's actual key.
  const payload = {
    type: 'payment',
    uuid: '62f88b36-a9d5-4fa6-aa26-e040c3dbf26d',
    order_id: '97a75bf8eda5cca41ba9d2e104840fcd',
    amount: '3.00000000',
    payment_amount: '3.00000000',
    payment_amount_usd: '0.23',
    merchant_amount: '2.94000000',
    commission: '0.06000000',
    is_final: true,
    status: 'paid',
    from: 'THgEWubVc8tPKXLJ4VZ5zbiiAK7AgqSeGH',
    network: 'tron',
    currency: 'TRX',
    payer_currency: 'TRX',
    payer_amount: '0.00234567',
    txid: '6f0d9c8374db57cac0d806251473de754f361c83a03cd805f74aa9da3193486b',
  };

  const bare = JSON.stringify(payload);
  const sign = signFixture(bare, KEY);
  const withSign = bare.replace(/}$/, `,"sign":"${sign}"}`);

  assert.equal(verifyWebhookSignature(withSign, KEY), true);

  // Sanity: any tampering breaks it
  const tamperedAmount = withSign.replace('"3.00000000"', '"300.00000000"');
  assert.equal(verifyWebhookSignature(tamperedAmount, KEY), false);

  const tamperedStatus = withSign.replace('"paid"', '"fail"');
  assert.equal(verifyWebhookSignature(tamperedStatus, KEY), false);
});
