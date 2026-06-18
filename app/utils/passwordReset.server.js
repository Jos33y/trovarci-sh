/**
 * Password reset tokens.
 *
 * Why tokens (not 6-digit codes):
 *   - Signup verification: user just typed their email, a short code sent to
 *     the same inbox is fine (minimal brute force surface).
 *   - Password reset: attacker often already knows the target email. A 6-digit
 *     code has 1M possibilities; even with a 5-attempt cap that's probeable.
 *     256-bit random tokens deliver zero guessability.
 *
 * Storage model:
 *   - Reuses the email_verification_codes table with purpose='password_reset'.
 *   - `code_hash` column stores SHA-256 of the token (HMAC pepper applied).
 *   - `expires_at` = now() + 1 hour (vs 15 min for signup codes).
 *   - Single-use: consumed_at set on successful reset.
 *
 * Note: The CHECK constraint on purpose already allows 'password_reset'
 * (we included it when the auth baseline migration was written).
 */

import crypto from 'node:crypto';
import { sql } from './db.server';

const TOKEN_LENGTH_BYTES   = 32;
const TOKEN_EXPIRY_MS      = 60 * 60 * 1000;  // 1 hour
const PURPOSE              = 'password_reset';

function getPepper() {
  const pepper = process.env.VERIFICATION_CODE_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('VERIFICATION_CODE_PEPPER must be set and at least 32 chars');
  }
  return pepper;
}

function generateToken() {
  return crypto.randomBytes(TOKEN_LENGTH_BYTES).toString('base64url');
}

function hashToken(token, userId) {
  return crypto
    .createHmac('sha256', getPepper())
    .update(`${userId}:reset:${token}`)
    .digest('hex');
}

// -----------------------------------------------------------------------
// Issue
// -----------------------------------------------------------------------

/**
 * Issue a password reset token for a user. Any prior active reset token is
 * consumed in the same transaction (partial unique index enforces one live
 * token per purpose).
 *
 * Returns { token, expiresAt }. Caller sends the token in a reset link.
 * Only the hash is stored.
 */
export async function issuePasswordResetToken(userId) {
  const token = generateToken();
  const codeHash = hashToken(token, userId);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  await sql.begin(async (tx) => {
    await tx`
      UPDATE email_verification_codes
      SET consumed_at = now()
      WHERE user_id = ${userId}
        AND purpose = ${PURPOSE}
        AND consumed_at IS NULL
    `;
    await tx`
      INSERT INTO email_verification_codes (user_id, code_hash, purpose, expires_at)
      VALUES (${userId}, ${codeHash}, ${PURPOSE}, ${expiresAt})
    `;
  });

  return { token, expiresAt };
}

// -----------------------------------------------------------------------
// Verify (does not consume)
//
// Used by GET /reset-password?token=X to check the link before rendering
// the new-password form. Returns the user_id if valid, null otherwise.
// -----------------------------------------------------------------------

export async function peekResetToken(token) {
  if (typeof token !== 'string' || token.length < 40) return null;

  const rows = await sql`
    SELECT id, user_id, code_hash, expires_at
    FROM email_verification_codes
    WHERE purpose = ${PURPOSE}
      AND consumed_at IS NULL
      AND expires_at > now()
  `;

  // Compute hash candidates against each row's user_id; timing-safe per-row.
  for (const row of rows) {
    const expected = Buffer.from(row.code_hash, 'hex');
    const submitted = Buffer.from(hashToken(token, row.user_id), 'hex');
    if (expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted)) {
      return { userId: row.user_id, tokenRowId: row.id };
    }
  }
  return null;
}

// -----------------------------------------------------------------------
// Consume (single-use redemption)
//
// Atomic: SELECT FOR UPDATE the token row, verify not consumed, mark consumed.
// Returns the user_id on success, null on failure (already used, expired,
// or not found).
// -----------------------------------------------------------------------

export async function consumeResetToken(token) {
  if (typeof token !== 'string' || token.length < 40) return null;

  return await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT id, user_id, code_hash, expires_at, consumed_at
      FROM email_verification_codes
      WHERE purpose = ${PURPOSE}
        AND consumed_at IS NULL
        AND expires_at > now()
      FOR UPDATE
    `;

    for (const row of rows) {
      const expected = Buffer.from(row.code_hash, 'hex');
      const submitted = Buffer.from(hashToken(token, row.user_id), 'hex');
      if (expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted)) {
        await tx`
          UPDATE email_verification_codes
          SET consumed_at = now()
          WHERE id = ${row.id}
        `;
        return { userId: row.user_id };
      }
    }
    return null;
  });
}
