// License codec tests. Proves this repo produces the same keys as trovarcis-sender.
//
// The vectors file is the cross-repo contract. If a change here breaks it, the
// server implementation in item 8 is already broken too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

import {
  KEY_LENGTH,
  TOTAL_BYTES,
  encodePayload,
  decodePayload,
  formatKey,
  parseKey
} from '../app/lib/licenseCodec.server.js';
import { toMask, fromMask, has } from '../app/lib/entitlements.server.js';

const fixture = JSON.parse(readFileSync(new URL('./license-vectors.json', import.meta.url), 'utf8'));
const privateKey = createPrivateKey(fixture.privateKeyPem);
const publicKey = createPublicKey({ key: Buffer.from(fixture.publicKeyDer, 'base64'), format: 'der', type: 'spki' });

test('vectors reproduce byte for byte', () => {
  for (const v of fixture.vectors) {
    const payload = encodePayload(v);
    assert.equal(payload.toString('hex'), v.payloadHex, v.name);
    assert.equal(formatKey(payload, sign(null, payload, privateKey)), v.key, v.name);
    assert.equal(v.key.length, KEY_LENGTH, v.name);
  }
});

test('vectors verify and decode', () => {
  for (const v of fixture.vectors) {
    const parsed = parseKey(v.key);
    assert.equal(parsed.ok, true, v.name);
    assert.equal(verify(null, parsed.payload, publicKey, parsed.signature), true, v.name);

    const decoded = decodePayload(parsed.payload);
    assert.equal(decoded.licenseId, v.licenseId, v.name);
    assert.equal(decoded.issuedAt, v.issuedAt, v.name);
    assert.equal(decoded.entitlements, v.entitlements, v.name);
  }
});

test('whitespace and line breaks survive an email client', () => {
  const key = fixture.vectors[0].key;
  const wrapped = `${key.slice(0, 40)}\n${key.slice(40, 80)}\r\n  ${key.slice(80)}  `;
  assert.equal(parseKey(wrapped).ok, true);
});

test('truncation reports as truncation, not as a bad signature', () => {
  const short = parseKey(fixture.vectors[0].key.slice(0, 90));
  assert.equal(short.ok, false);
  assert.match(short.error, /incomplete/);
  assert.match(short.error, /124 characters and yours is 90/);
});

test('malformed input is rejected without throwing', () => {
  const cases = ['', '   ', 'hello', 'TROV2.abc', 'TROV1.', 'TROV1.!!!!', null, undefined, 12345];
  for (const c of cases) {
    const r = parseKey(c);
    assert.equal(r.ok, false, String(c));
    assert.equal(typeof r.error, 'string');
  }
});

test('a flipped byte anywhere fails verification', () => {
  const v = fixture.vectors[0];
  const bytes = Buffer.from(v.key.slice(v.key.indexOf('.') + 1), 'base64url');
  for (const i of [0, 15, 16, 20, 23, 24, 60, TOTAL_BYTES - 1]) {
    const tampered = Buffer.from(bytes);
    tampered[i] ^= 0xff;
    const parsed = parseKey(`TROV1.${tampered.toString('base64url')}`);
    assert.equal(parsed.ok, true, `offset ${i} still parses`);
    assert.equal(verify(null, parsed.payload, publicKey, parsed.signature), false, `offset ${i} must not verify`);
  }
});

test('a signature from a different key fails', () => {
  const payload = encodePayload(fixture.vectors[0]);
  const parsed = parseKey(formatKey(payload, Buffer.alloc(64)));
  assert.equal(parsed.ok, true);
  assert.equal(verify(null, parsed.payload, publicKey, parsed.signature), false);
});

test('entitlement mask round trips', () => {
  assert.equal(toMask(['sender']), 1);
  assert.deepEqual(fromMask(1), ['sender']);
  assert.deepEqual(fromMask(0), []);
  assert.equal(has(1, 'sender'), true);
  assert.equal(has(0, 'sender'), false);
  assert.equal(has(1, 'nonexistent'), false);
  assert.throws(() => toMask(['nonexistent']));
});

test('unknown slots in a future key do not break decoding', () => {
  // A v2 server issuing entitlement slot 9 must still decode in a v1 app.
  const payload = encodePayload({ ...fixture.vectors[0], entitlements: 0b1000000001 });
  const decoded = decodePayload(payload);
  assert.equal(decoded.entitlements, 0b1000000001);
  assert.deepEqual(fromMask(decoded.entitlements), ['sender']);
});

test('issuedAt survives to 2106', () => {
  const decoded = decodePayload(encodePayload({ ...fixture.vectors[0], issuedAt: '2106-02-07T06:28:15.000Z' }));
  assert.equal(decoded.issuedAt, '2106-02-07T06:28:15.000Z');
});
