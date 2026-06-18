/**
 * Credit ledger migration.
 *
 * Creates the credit_transactions table - an append-only ledger that records
 * every change to users.credits_balance. Rows are never updated or deleted;
 * reversals are NEW rows with opposite-sign deltas.
 *
 * Why balance_after is stored:
 *   - Fast history reads. Dashboard transaction tab renders balance-at-the-time
 *     without summing deltas from account creation.
 *   - Drift detection. If SUM(delta) != latest balance_after for a user,
 *     something wrote to users.credits_balance outside of spendCredits /
 *     grantCredits / refundCredits - an audit red flag.
 *
 * Why reference_id is generic:
 *   - Points to payments.id for purchases, jobs.id for usage (future), or NULL
 *     for grants/adjustments. Avoids a polymorphic mess of per-type FK columns.
 *
 * Why type is CHECK'd TEXT not ENUM:
 *   - Postgres enums can't be dropped from; adding values requires an ALTER
 *     per-value. A TEXT + CHECK gives the same safety with zero migration pain
 *     when the team adds 'transfer' or 'bonus' later.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE credit_transactions (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta           INTEGER      NOT NULL,
      balance_after   INTEGER      NOT NULL,
      type            TEXT         NOT NULL,
      reference_id    UUID,
      metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT ct_type_valid      CHECK (type IN ('purchase', 'usage', 'refund', 'grant', 'adjustment')),
      CONSTRAINT ct_delta_nonzero   CHECK (delta <> 0),
      CONSTRAINT ct_balance_nonneg  CHECK (balance_after >= 0),

      CONSTRAINT ct_sign_matches_type CHECK (
        (type IN ('purchase', 'refund', 'grant') AND delta > 0) OR
        (type = 'usage' AND delta < 0) OR
        (type = 'adjustment')
      )
    );
  `);

  pgm.sql(`
    CREATE INDEX ct_user_created
      ON credit_transactions (user_id, created_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX ct_reference
      ON credit_transactions (reference_id)
      WHERE reference_id IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX ct_user_type_created
      ON credit_transactions (user_id, type, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS credit_transactions;`);
};
