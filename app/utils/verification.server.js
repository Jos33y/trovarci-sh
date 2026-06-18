/**
 * Email verification codes.
 *
 * Flow:
 *   1. User signs up. We call issueVerificationCode(userId, 'signup') which
 *      consumes any prior active code and writes a new one. The plaintext code
 *      is returned so the caller can email it via Resend.
 *   2. User submits the 6-digit code. We call verifyCode(userId, code, 'signup').
 *      On success the code is consumed and the user is ready to be marked
 *      verified.
 *
 * Security:
 *   - Code is 6 decimal digits (1,000,000 code space). Attempt counter caps
 *     per-code brute force at 5 attempts. The 15-minute expiry + rate limit
 *     on resend caps the practical attack rate.
 *   - Storage is HMAC-SHA256(pepper, userId || ':' || code). The pepper lives
 *     in the VERIFICATION_CODE_PEPPER env var. A DB breach alone does not
 *     reveal codes; rotating the pepper invalidates all codes instantly.
 *   - Hash comparison uses crypto.timingSafeEqual.
 *   - One active code per (user_id, purpose) is enforced by a partial unique
 *     index, so the issue step is atomic via BEGIN / UPDATE-existing / INSERT.
 */

import crypto from 'node:crypto';
import { sql } from './db.server.js';

const CODE_DIGITS = 6;
const CODE_SPACE = 10 ** CODE_DIGITS;       // 1,000,000
const CODE_EXPIRY_MS = 15 * 60 * 1000;       // 15 minutes
const MAX_ATTEMPTS = 5;

const VALID_PURPOSES = new Set(['signup', 'email_change', 'reauth']);

function getPepper() {
  const pepper = process.env.VERIFICATION_CODE_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error(
      'VERIFICATION_CODE_PEPPER must be set and at least 32 chars. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  return pepper;
}

/**
 * Cryptographically random 6-digit code. Uses rejection sampling to avoid the
 * modulo bias that a naive `% 1000000` would introduce (UInt32 % 1e6 skews
 * the first ~705k values slightly higher than the rest).
 */
function generateCode() {
  const limit = Math.floor(0xffffffff / CODE_SPACE) * CODE_SPACE;
  while (true) {
    const n = crypto.randomBytes(4).readUInt32BE(0);
    if (n < limit) {
      return (n % CODE_SPACE).toString().padStart(CODE_DIGITS, '0');
    }
  }
}

function hashCode(code, userId) {
  return crypto
    .createHmac('sha256', getPepper())
    .update(`${userId}:${code}`)
    .digest('hex');
}

function assertPurpose(purpose) {
  if (!VALID_PURPOSES.has(purpose)) {
    throw new Error(`Invalid verification purpose: ${purpose}`);
  }
}

// -----------------------------------------------------------------------
// Issue
// -----------------------------------------------------------------------

/**
 * Issue a new verification code. Returns { code, expiresAt }. The caller
 * delivers `code` to the user (typically via email); only the hash is stored.
 *
 * Atomicity: in a single transaction, any existing unconsumed code for the
 * same (user, purpose) is marked consumed, then the new code is inserted.
 * The partial unique index enforces correctness even under concurrent calls.
 */
export async function issueVerificationCode(userId, purpose = 'signup') {
  assertPurpose(purpose);

  const code = generateCode();
  const codeHash = hashCode(code, userId);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  await sql.begin(async (tx) => {
    await tx`
      UPDATE email_verification_codes
      SET consumed_at = now()
      WHERE user_id = ${userId}
        AND purpose = ${purpose}
        AND consumed_at IS NULL
    `;
    await tx`
      INSERT INTO email_verification_codes (user_id, code_hash, purpose, expires_at)
      VALUES (${userId}, ${codeHash}, ${purpose}, ${expiresAt})
    `;
  });

  return { code, expiresAt };
}

// -----------------------------------------------------------------------
// Verify
// -----------------------------------------------------------------------

/**
 * Verify a submitted code.
 *
 * Returns:
 *   { ok: true }
 *   { ok: false, reason: 'no_code' }            // nothing to verify
 *   { ok: false, reason: 'expired' }            // past expires_at
 *   { ok: false, reason: 'too_many_attempts' }  // >=5 attempts, code burned
 *   { ok: false, reason: 'invalid_code' }       // hash mismatch; attempt counted
 *
 * Uses FOR UPDATE to serialize concurrent verify attempts on the same code.
 * On a wrong code, increments attempts. On a right code, consumes the row.
 */
export async function verifyCode(userId, code, purpose = 'signup') {
  assertPurpose(purpose);

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: 'invalid_code' };
  }

  const submittedHash = hashCode(code, userId);

  return await sql.begin(async (tx) => {
    const [row] = await tx`
      SELECT id, code_hash, expires_at, attempts
      FROM email_verification_codes
      WHERE user_id = ${userId}
        AND purpose = ${purpose}
        AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `;

    if (!row) {
      return { ok: false, reason: 'no_code' };
    }

    if (new Date(row.expires_at) < new Date()) {
      return { ok: false, reason: 'expired' };
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await tx`
        UPDATE email_verification_codes
        SET consumed_at = now()
        WHERE id = ${row.id}
      `;
      return { ok: false, reason: 'too_many_attempts' };
    }

    const storedBuf = Buffer.from(row.code_hash, 'hex');
    const submittedBuf = Buffer.from(submittedHash, 'hex');
    const match =
      storedBuf.length === submittedBuf.length &&
      crypto.timingSafeEqual(storedBuf, submittedBuf);

    if (!match) {
      await tx`
        UPDATE email_verification_codes
        SET attempts = attempts + 1
        WHERE id = ${row.id}
      `;
      return { ok: false, reason: 'invalid_code' };
    }

    await tx`
      UPDATE email_verification_codes
      SET consumed_at = now()
      WHERE id = ${row.id}
    `;

    return { ok: true };
  });
}
