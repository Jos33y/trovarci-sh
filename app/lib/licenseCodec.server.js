// License key codec. Byte-identical twin of src/shared/licenseCodec.js in trovarcis-sender.
// The spec is the format block in decisions-sender-2026-08-24.md. test/license-vectors.json
// is the contract: if this file and the app disagree, the vectors stop reproducing.
//
// TROV1.<base64url(payload || signature)>
//    0  16  licenseId     UUID raw bytes
//   16   4  issuedAt      uint32 BE unix seconds
//   20   4  entitlements  uint32 BE bitmask
//   24  64  signature     Ed25519 over the 24 payload bytes

export const PREFIX = 'TROV1';
export const PAYLOAD_BYTES = 24;
export const SIGNATURE_BYTES = 64;
export const TOTAL_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES;
export const KEY_LENGTH = PREFIX.length + 1 + Math.ceil((TOTAL_BYTES * 4) / 3);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodePayload({ licenseId, issuedAt, entitlements }) {
  if (!UUID_RE.test(licenseId)) throw new Error(`licenseId is not a uuid: ${licenseId}`);

  const seconds = Math.floor(new Date(issuedAt).getTime() / 1000);
  if (!Number.isFinite(seconds)) throw new Error(`issuedAt is not a date: ${issuedAt}`);

  const buf = Buffer.alloc(PAYLOAD_BYTES);
  Buffer.from(licenseId.replace(/-/g, ''), 'hex').copy(buf, 0);
  buf.writeUInt32BE(seconds, 16);
  buf.writeUInt32BE(entitlements >>> 0, 20);
  return buf;
}

export function decodePayload(buf) {
  const hex = buf.subarray(0, 16).toString('hex');
  return {
    licenseId: [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'),
    issuedAt: new Date(buf.readUInt32BE(16) * 1000).toISOString(),
    entitlements: buf.readUInt32BE(20)
  };
}

export function formatKey(payload, signature) {
  return `${PREFIX}.${Buffer.concat([payload, signature]).toString('base64url')}`;
}

// Returns { ok:true, payload, signature } or { ok:false, error }. Never throws on user input.
export function parseKey(input) {
  const raw = String(input || '').trim().replace(/\s+/g, '');
  if (!raw) return { ok: false, error: 'Paste the license key from your email.' };

  const dot = raw.indexOf('.');
  if (dot === -1 || raw.slice(0, dot) !== PREFIX) {
    return { ok: false, error: `That is not a Trovarcis license key. It starts with ${PREFIX}.` };
  }

  const body = raw.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) {
    return { ok: false, error: 'This key contains characters that do not belong in it. Copy it again.' };
  }

  const bytes = Buffer.from(body, 'base64url');

  // Fixed length is why a truncated paste reports as truncated and not as a bad signature.
  if (bytes.length !== TOTAL_BYTES) {
    const verb = raw.length < KEY_LENGTH ? 'incomplete' : 'too long';
    return {
      ok: false,
      error: `This key looks ${verb}. It should be ${KEY_LENGTH} characters and yours is ${raw.length}.`
    };
  }

  return {
    ok: true,
    payload: bytes.subarray(0, PAYLOAD_BYTES),
    signature: bytes.subarray(PAYLOAD_BYTES)
  };
}
