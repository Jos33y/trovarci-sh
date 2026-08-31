// Sender license issuance, device activation, check-in and revocation.

import { sign, createPrivateKey, randomUUID } from 'node:crypto';
import { sql } from '~/utils/db.server';
import { encodePayload, formatKey, parseKey, decodePayload } from '~/lib/licenseCodec.server';
import { toMask, fromMask } from '~/lib/entitlements.server';

const DEFAULT_MAX_DEVICES = 3;

let cachedKey = null;

// LICENSE_PRIVATE_KEY_DER is single-line base64 of the PKCS8 DER. A PEM does not
// survive an env var cleanly and Coolify only sets env vars.
function getPrivateKey() {
  if (cachedKey) return cachedKey;
  const der = process.env.LICENSE_PRIVATE_KEY_DER;
  if (!der) throw new Error('LICENSE_PRIVATE_KEY_DER is required to issue licenses');
  cachedKey = createPrivateKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'pkcs8' });
  return cachedKey;
}

function shape(row, liveDevices = null) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    licenseKey: row.license_key,
    product: row.product,
    entitlements: fromMask(row.entitlements),
    maxDevices: row.max_devices,
    status: row.status,
    paymentReference: row.payment_reference,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    liveDevices,
  };
}

// Returns the issued license including its key. The key is stored so "I lost the email"
// is a dashboard lookup rather than a re-sign, which would produce a different key.
export async function issueLicense({ userId, entitlements = ['sender'], maxDevices = DEFAULT_MAX_DEVICES, paymentReference = null, issuedBy = null }) {
  const licenseId = randomUUID();
  const issuedAt = new Date();
  const mask = toMask(entitlements);

  const payload = encodePayload({ licenseId, issuedAt: issuedAt.toISOString(), entitlements: mask });
  const licenseKey = formatKey(payload, sign(null, payload, getPrivateKey()));

  const [row] = await sql`
    INSERT INTO licenses
      (id, user_id, license_key, product, entitlements, max_devices, payment_reference, issued_by, issued_at)
    VALUES
      (${licenseId}, ${userId}, ${licenseKey}, 'sender', ${mask}, ${maxDevices}, ${paymentReference}, ${issuedBy}, ${issuedAt})
    RETURNING *
  `;

  return shape(row, 0);
}

// Looks a license up by the key the app presented. The signature is checked before this
// is called, so a lookup miss means the key is genuine but unknown to us.
export async function getLicenseByKey(key) {
  const parsed = parseKey(key);
  if (!parsed.ok) return null;

  const [row] = await sql`
    SELECT * FROM licenses WHERE license_key = ${String(key).trim().replace(/\s+/g, '')}
  `;
  if (!row) return null;

  // The key encodes its own license id. A mismatch means the row was tampered with.
  if (decodePayload(parsed.payload).licenseId !== row.id) return null;

  return row;
}

export async function countLiveDevices(licenseId) {
  const [row] = await sql`
    SELECT count(*)::int AS n FROM license_activations
    WHERE license_id = ${licenseId} AND released_at IS NULL
  `;
  return row.n;
}

// Returns { ok:true, license, devices } or { ok:false, reason }. Reasons are for our
// logs, not for the response body. The route decides what the app is told.
export async function activateDevice({ key, deviceId, deviceLabel, appVersion, platform }) {
  const row = await getLicenseByKey(key);
  if (!row) return { ok: false, reason: 'unknown_license' };
  if (row.status === 'revoked') return { ok: false, reason: 'revoked' };

  // Reactivating a device already on this license is a no-op refresh, not a new slot.
  const [existing] = await sql`
    SELECT * FROM license_activations
    WHERE license_id = ${row.id} AND device_id = ${deviceId} AND released_at IS NULL
  `;

  if (existing) {
    await sql`
      UPDATE license_activations
      SET last_seen_at = now(), app_version = ${appVersion}, platform = ${platform}
      WHERE id = ${existing.id}
    `;
    return { ok: true, license: row, devices: await deviceSummary(row) };
  }

  const used = await countLiveDevices(row.id);
  if (used >= row.max_devices) {
    return { ok: false, reason: 'device_limit', license: row, devices: { used, allowed: row.max_devices } };
  }

  try {
    await sql`
      INSERT INTO license_activations (license_id, device_id, device_label, app_version, platform)
      VALUES (${row.id}, ${deviceId}, ${deviceLabel}, ${appVersion}, ${platform})
    `;
  } catch (err) {
    // 23505 means a concurrent activation of the same device won the race. Treat as success.
    if (err?.code !== '23505') throw err;
  }

  return { ok: true, license: row, devices: await deviceSummary(row) };
}

// Returns { ok:true, license, devices } or { ok:false, reason }. A check-in never
// creates an activation: a device that was released has to activate again.
export async function checkIn({ key, deviceId, appVersion }) {
  const row = await getLicenseByKey(key);
  if (!row) return { ok: false, reason: 'unknown_license' };
  if (row.status === 'revoked') return { ok: false, reason: 'revoked' };

  const [updated] = await sql`
    UPDATE license_activations
    SET last_seen_at = now(), app_version = ${appVersion}
    WHERE license_id = ${row.id} AND device_id = ${deviceId} AND released_at IS NULL
    RETURNING id
  `;
  if (!updated) return { ok: false, reason: 'device_not_activated' };

  return { ok: true, license: row, devices: await deviceSummary(row) };
}

async function deviceSummary(row) {
  return { used: await countLiveDevices(row.id), allowed: row.max_devices };
}

export async function releaseDevice({ licenseId, activationId }) {
  const [row] = await sql`
    UPDATE license_activations
    SET released_at = now()
    WHERE id = ${activationId} AND license_id = ${licenseId} AND released_at IS NULL
    RETURNING id
  `;
  return { ok: Boolean(row) };
}

export async function revokeLicense({ licenseId, reason }) {
  const [row] = await sql`
    UPDATE licenses
    SET status = 'revoked', revoked_at = now(), revoked_reason = ${reason}
    WHERE id = ${licenseId} AND status = 'active'
    RETURNING *
  `;
  return { ok: Boolean(row), license: shape(row) };
}

export async function listLicenseDevices(licenseId) {
  return sql`
    SELECT id, device_id, device_label, app_version, platform, activated_at, last_seen_at
    FROM license_activations
    WHERE license_id = ${licenseId} AND released_at IS NULL
    ORDER BY activated_at ASC
  `;
}
