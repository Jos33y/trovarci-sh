/**
 * Credit ledger idempotency hardening.
 *
 * Closes a race in grantCredits / refundCredits. The current code does:
 *
 *   BEGIN
 *     SELECT id FROM credit_transactions WHERE (user, type, ref) -- empty
 *     INSERT credit_transactions(...)
 *   COMMIT
 *
 * Two concurrent webhook deliveries (Cryptomus retries within milliseconds
 * are routine) both pass the SELECT empty-set check, both INSERT, both
 * commit. Result: the user is credited twice for one payment.
 *
 * Fix: a partial unique index on (user_id, type, reference_id) scoped to
 * the four idempotent grant types. The second concurrent INSERT raises
 * 23505 (unique_violation); credits.server.js catches it and re-fetches
 * the winning row, returning idempotent=true.
 *
 * Why the type filter:
 *   - 'usage' rows (spendCredits) may legitimately share a reference_id;
 *     they are not idempotent on it. Including 'usage' in the constraint
 *     would break normal operation.
 *
 * Why partial (WHERE reference_id IS NOT NULL):
 *   - Welcome bonuses, manual adjustments, and any future grant without a
 *     reference would otherwise collide on the NULL value (Postgres treats
 *     NULL as not-equal so this is mostly defensive, but the partial index
 *     is also smaller and faster).
 *
 * Why not CONCURRENTLY:
 *   - Pre-launch table is empty / dev-only data; a brief AccessExclusive
 *     lock is fine. Post-launch growth would warrant noTransaction() +
 *     CREATE INDEX CONCURRENTLY, but that costs a write outage of one
 *     migration and we are not at scale yet.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE UNIQUE INDEX ct_idempotent_grant
      ON credit_transactions (user_id, type, reference_id)
      WHERE reference_id IS NOT NULL
        AND type IN ('purchase', 'grant', 'refund', 'adjustment');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS ct_idempotent_grant;`);
};
