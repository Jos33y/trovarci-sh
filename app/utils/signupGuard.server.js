// Signup bot checks, all invisible to a person filling the form: a signed form token that only a
// loaded page carries, a hidden field only bots fill, and Cloudflare Turnstile when its keys are set.

import crypto from 'node:crypto';

const MIN_AGE_MS = 1500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const HONEYPOT_FIELD = 'company_site';

function key() {
  return process.env.VERIFICATION_CODE_PEPPER || '';
}

function sign(ts) {
  return crypto.createHmac('sha256', key()).update(`signup-form:${ts}`).digest('base64url');
}

export function issueFormToken(now = Date.now()) {
  return `${now}.${sign(now)}`;
}

// Returns null when the token is good, or a code for the log.
export function checkFormToken(token, now = Date.now()) {
  const m = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(String(token || ''));
  if (!m) return 'NO_FORM_TOKEN';
  const expected = Buffer.from(sign(m[1]));
  const given = Buffer.from(m[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return 'BAD_FORM_TOKEN';
  const age = now - Number(m[1]);
  if (age < MIN_AGE_MS) return 'FORM_TOO_FAST';
  if (age > MAX_AGE_MS) return 'FORM_STALE';
  return null;
}

export function turnstileSiteKey() {
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null;
}

// Fails open when Cloudflare cannot be reached, so an outage never locks out real people;
// the form token still stands in front.
export async function checkTurnstile(response, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return null;
  if (!response) return 'TURNSTILE_MISSING';
  try {
    const body = new URLSearchParams({ secret, response: String(response) });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const out = await res.json();
    return out.success ? null : 'TURNSTILE_FAILED';
  } catch (err) {
    console.warn(`[signup guard] Turnstile unreachable, allowing: ${err.message}`);
    return null;
  }
}
