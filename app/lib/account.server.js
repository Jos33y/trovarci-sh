// Account lifecycle: soft delete (anonymize PII, keep ledger) + GDPR export (single JSON file).

import { sql } from '../utils/db.server.js';

// Anonymize email, null password, set deleted_at, revoke all sessions. Ledger rows untouched.
export async function softDeleteUser(userId) {
  if (!userId) throw new Error('softDeleteUser: userId required');

  return sql.begin(async (tx) => {
    const [existing] = await tx`
      SELECT id, deleted_at, role FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (!existing) throw new Error('User not found');
    if (existing.deleted_at) return { ok: true, alreadyDeleted: true };
    if (existing.role === 'admin') throw new Error('Cannot self-delete admin account');

    const placeholder = `deleted+${userId}@trovarcis.com`;

    await tx`
      UPDATE users
      SET email         = ${placeholder},
          password_hash = NULL,
          deleted_at    = now()
      WHERE id = ${userId}
    `;

    await tx`
      UPDATE sessions
      SET revoked_at = now()
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `;

    // Anonymize linked contact messages so PII is gone there too.
    await tx`
      UPDATE contact_messages
      SET email = ${placeholder}, name = 'Deleted user'
      WHERE user_id = ${userId}
    `;

    return { ok: true, alreadyDeleted: false };
  });
}

// Build the full data export for a user. Returns plain object - caller serializes to JSON.
export async function buildUserDataExport(userId) {
  const [user] = await sql`
    SELECT id, email, role, credits_balance, email_verified_at, created_at, deleted_at
    FROM users WHERE id = ${userId} LIMIT 1
  `;
  if (!user) throw new Error('User not found');

  const [transactions, payments, jobs, messages] = await Promise.all([
    sql`
      SELECT id, delta, balance_after, type, reference_id, metadata, created_at
      FROM credit_transactions
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, gateway, status, package_key, credits, amount_usd_cents,
             payer_currency, payer_amount, txid, created_at, completed_at, metadata
      FROM payments
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, type, status, total_rows, processed_rows, valid_count,
             error_count, credits_held, credits_refunded, created_at,
             completed_at, metadata
      FROM verification_jobs
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, subject, name, email, message, source, status, created_at
      FROM contact_messages
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `,
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note: 'This file contains all personal data Trovarcis holds about your account. Item-level verification results are not included; download per-job CSVs from the app while your account is active.',
    user: {
      id:               user.id,
      email:            user.email,
      role:             user.role,
      creditsBalance:   user.credits_balance,
      emailVerifiedAt:  user.email_verified_at,
      createdAt:        user.created_at,
      deletedAt:        user.deleted_at,
    },
    creditTransactions: transactions,
    payments,
    verificationJobs:   jobs,
    contactMessages:    messages,
  };
}
