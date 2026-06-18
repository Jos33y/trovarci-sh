/**
 * Input validation.
 *
 * Pure functions. Each returns { ok: true, value } on success or
 * { ok: false, error } on failure. No database calls, no I/O.
 */

// RFC 5321 caps local-part at 64 and domain at 255. Total cap of 254 matches
// what real mail servers accept in practice.
const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Email is required' };
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: false, error: 'Email is required' };
  if (value.length > MAX_EMAIL_LENGTH) return { ok: false, error: 'Email is too long' };
  if (!EMAIL_REGEX.test(value)) return { ok: false, error: 'Enter a valid email' };
  return { ok: true, value };
}

// argon2 treats input as a Buffer and handles long strings, but capping here
// protects against DoS via 10MB password submissions.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export function validatePassword(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Password is required' };
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (raw.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be under ${MAX_PASSWORD_LENGTH} characters` };
  }
  return { ok: true, value: raw };
}

export function validateVerificationCode(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Code is required' };
  const value = raw.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(value)) return { ok: false, error: 'Enter the 6-digit code' };
  return { ok: true, value };
}

/**
 * Block open-redirect payloads. Accept only same-origin absolute paths.
 */
export function safeRedirect(to, fallback = '/dashboard') {
  if (typeof to !== 'string' || !to) return fallback;
  if (!to.startsWith('/')) return fallback;
  if (to.startsWith('//')) return fallback;
  if (to.startsWith('/\\')) return fallback;
  return to;
}
