// POST /api/license/check-in - refreshes a device timestamp and reports revocation.

import { verify, createPublicKey } from 'node:crypto';
import { parseKey } from '~/lib/licenseCodec.server';
import { checkIn } from '~/lib/licenses.server';
import { getClientIp, licenseRateLimit } from '~/lib/licenseRateLimit.server';

const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const VERSION_MAX = 32;

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

  const rl = licenseRateLimit(getClientIp(request));
  if (!rl.allowed) {
    return Response.json(
      { ok: false, code: 'RATE_LIMITED' },
      { status: 429, headers: rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {} },
    );
  }

  try {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 }); }

    // The whole payload. Adding a field here breaks the promise the product is sold on.
    const key = typeof body?.licenseKey === 'string' ? body.licenseKey : '';
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.trim().slice(0, VERSION_MAX) : null;

    if (!DEVICE_ID_RE.test(deviceId)) {
      return Response.json({ ok: false, code: 'BAD_DEVICE_ID' }, { status: 400 });
    }

    const parsed = parseKey(key);
    if (!parsed.ok) {
      return Response.json({ ok: false, code: 'BAD_KEY' }, { status: 400 });
    }

    if (!verify(null, parsed.payload, getPublicKey(), parsed.signature)) {
      return Response.json({ ok: false, code: 'BAD_KEY' }, { status: 400 });
    }

    const result = await checkIn({ key, deviceId, appVersion });

    if (!result.ok && result.reason === 'revoked') {
      return Response.json({ ok: false, code: 'REVOKED' }, { status: 403 });
    }

    if (!result.ok && result.reason === 'device_not_activated') {
      // The slot was released from the dashboard. The app should activate again, not lock.
      return Response.json({ ok: false, code: 'NOT_ACTIVATED' }, { status: 409 });
    }

    if (!result.ok) {
      return Response.json({ ok: false, code: 'UNKNOWN_LICENSE' }, { status: 404 });
    }

    return Response.json({ ok: true, devices: result.devices });

  } catch (err) {
    console.error('[license check-in] uncaught:', err?.message || err);
    return Response.json({ ok: false, code: 'INTERNAL' }, { status: 500 });
  }
}
