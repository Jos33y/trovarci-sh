/**
 * Authentication core.
 *
 * Responsibilities:
 *   - hashPassword / verifyPassword / needsRehash wrappers around argon2id
 *   - createUser with unique-email error handling + atomic welcome bonus grant
 *   - authenticateUser with timing-safe handling of "no such user"
 *   - markEmailVerified, updatePassword
 *
 * argon2id parameters follow OWASP 2024/2025 guidance for server hardware:
 *   memoryCost:  64 MiB
 *   timeCost:    3 iterations
 *   parallelism: 1
 */

import argon2 from 'argon2';
import { sql } from '~/utils/db.server';
import { WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MiB in KiB
  timeCost: 3,
  parallelism: 1,
};

let DUMMY_HASH_PROMISE = null;
function getDummyHash() {
  if (!DUMMY_HASH_PROMISE) {
    DUMMY_HASH_PROMISE = argon2.hash('dummy-value-no-user-exists', ARGON2_OPTIONS);
  }
  return DUMMY_HASH_PROMISE;
}

// -----------------------------------------------------------------------
// Password primitives
// -----------------------------------------------------------------------

export async function hashPassword(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash, plaintext) {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

export function needsRehash(hash) {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------
// User lifecycle
// -----------------------------------------------------------------------

/**
 * Create a new user with initial welcome bonus, atomically.
 *
 * Transaction:
 *   1. INSERT user with credits_balance = WELCOME_BONUS_AMOUNT
 *   2. INSERT credit_transactions row (type='grant', delta=bonus, balance_after=bonus)
 *
 * Both succeed or neither does. If the welcome bonus is 0 (disabled via env),
 * no ledger row is written but the user still gets created cleanly.
 */
export async function createUser(email, password) {
  const passwordHash = await hashPassword(password);

  try {
    const user = await sql.begin(async (tx) => {
      const [row] = await tx`
        INSERT INTO users (email, password_hash, credits_balance)
        VALUES (${email}, ${passwordHash}, ${WELCOME_BONUS_AMOUNT})
        RETURNING id, email, email_verified_at, credits_balance, role, created_at
      `;

      if (WELCOME_BONUS_AMOUNT > 0) {
        // reference_id = the new user's UUID. The partial unique index
        // ct_idempotent_grant on (user_id, type, reference_id) makes this
        // INSERT idempotent: if createUser is somehow called twice for
        // the same email-row (shouldn't happen, but defence-in-depth),
        // the second welcome-bonus INSERT raises 23505 and we catch it
        // outside the transaction. The user already has their bonus from
        // the first call, so re-running createUser doesn't double-credit.
        await tx`
          INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
          VALUES (
            ${row.id},
            ${WELCOME_BONUS_AMOUNT},
            ${WELCOME_BONUS_AMOUNT},
            'grant',
            ${row.id},
            ${sql.json({ source: 'welcome_bonus' })}
          )
        `;
      }

      return row;
    });

    return { ok: true, user: mapUserRow(user) };
  } catch (err) {
    if (err.code === '23505') return { ok: false, reason: 'email_taken' };
    if (err.code === '23514') return { ok: false, reason: 'invalid_email' };
    throw err;
  }
}

/**
 * Authenticate by email + password. Returns { ok: true, user } on success,
 * { ok: false } on any failure. Timing is equalized between failure modes.
 */
export async function authenticateUser(email, password) {
  const [user] = await sql`
    SELECT id, email, password_hash, email_verified_at, credits_balance, role
    FROM users
    WHERE email = ${email} AND deleted_at IS NULL
    LIMIT 1
  `;

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    return { ok: false };
  }

  const match = await verifyPassword(user.password_hash, password);
  if (!match) {
    return { ok: false };
  }

  // Transparent rehash if argon2 parameters have been upgraded.
  if (needsRehash(user.password_hash)) {
    hashPassword(password)
      .then((newHash) =>
        sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`
      )
      .catch(() => {});
  }

  return { ok: true, user: mapUserRow(user) };
}

export async function markEmailVerified(userId) {
  await sql`
    UPDATE users
    SET email_verified_at = now()
    WHERE id = ${userId} AND email_verified_at IS NULL
  `;
}

export async function updatePassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}
    WHERE id = ${userId} AND deleted_at IS NULL
  `;
}

// Authenticated password change. Verifies current password before writing the new hash.
// Returns { ok:true } on success, { ok:false, reason } on any failure.
// Reasons: 'user_not_found' | 'wrong_password'. Caller decides what to surface.
export async function changePassword({ userId, currentPassword, newPassword }) {
  const [row] = await sql`
    SELECT password_hash
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!row) return { ok: false, reason: 'user_not_found' };

  const match = await verifyPassword(row.password_hash, currentPassword);
  if (!match) return { ok: false, reason: 'wrong_password' };

  await updatePassword(userId, newPassword);
  return { ok: true };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    creditsBalance: row.credits_balance,
    role: row.role,
  };
}
