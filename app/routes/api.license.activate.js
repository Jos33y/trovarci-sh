// POST /api/license/activate - binds a device to a license. Unauthenticated: the signed key is the credential.

import { verify, createPublicKey } from 'node:crypto';
import { parseKey } from '~/lib/licenseCodec.server';
import { activateDevice } from '~/lib/licenses.server';
import { getClientIp, licenseRateLimit } from '~/lib/licenseRateLimit.server';

const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const LABEL_MAX = 80;
const VERSION_MAX = 32;
const ALLOWED_PLATFORMS = new Set(['win32', 'darwin', 'linux']);

let cachedPublicKey = null;
function getPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  const der = process.env.LICENSE_PUBLIC_KEY_DER;
  if (!der) throw new Error('LICENSE_PUBLIC_KEY_DER is required');
  cachedPublicKey = createPublicKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'spki' });
  return cachedPublicKey;
}

export async function loader() {
  return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  const ip = getClientIp(request);
  const rl = licenseRateLimit(ip);
  if (!rl.allowed) {
    return Response.json(
      { ok: false, code: 'RATE_LIMITED', error: 'Too many attempts. Try again later.' },
      { status: 429, headers: rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {} },
    );
  }

  try {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 }); }

    const key = typeof body?.licenseKey === 'string' ? body.licenseKey : '';
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    const deviceLabel = typeof body?.deviceLabel === 'string' ? body.deviceLabel.trim().slice(0, LABEL_MAX) : null;
    const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.trim().slice(0, VERSION_MAX) : null;
    const platformRaw = typeof body?.platform === 'string' ? body.platform.trim() : '';
    const platform = ALLOWED_PLATFORMS.has(platformRaw) ? platformRaw : null;

    if (!DEVICE_ID_RE.test(deviceId)) {
      return Response.json({ ok: false, code: 'BAD_DEVICE_ID', error: 'Device id is not valid' }, { status: 400 });
    }

    const parsed = parseKey(key);
    if (!parsed.ok) {
      return Response.json({ ok: false, code: 'BAD_KEY', error: parsed.error }, { status: 400 });
    }

    // Signature first, so a forged key never reaches the database.
    if (!verify(null, parsed.payload, getPublicKey(), parsed.signature)) {
      console.warn(`[license activate] signature failed from ${ip || '(no ip)'}`);
      return Response.json(
        { ok: false, code: 'BAD_KEY', error: 'This key did not pass verification. Check it came from Trovarcis.' },
        { status: 400 },
      );
    }

    const result = await activateDevice({ key, deviceId, deviceLabel, appVersion, platform });

    if (!result.ok && result.reason === 'device_limit') {
      return Response.json(
        {
          ok: false,
          code: 'DEVICE_LIMIT',
          error: `This license is active on ${result.devices.allowed} devices already. Remove one from your dashboard to free a slot.`,
          devices: result.devices,
        },
        { status: 409 },
      );
    }

    if (!result.ok && result.reason === 'revoked') {
      return Response.json(
        { ok: false, code: 'REVOKED', error: 'This license is no longer active. Contact support.' },
        { status: 403 },
      );
    }

    if (!result.ok) {
      // A signed key we have no row for. Genuine signature, unknown license: worth a log.
      console.warn(`[license activate] ${result.reason} from ${ip || '(no ip)'}`);
      return Response.json(
        { ok: false, code: 'UNKNOWN_LICENSE', error: 'This key is not recognised. Contact support.' },
        { status: 404 },
      );
    }

    return Response.json({ ok: true, devices: result.devices });

  } catch (err) {
    console.error('[license activate] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: 'Could not activate. Try again.' },
      { status: 500 },
    );
  }
}
