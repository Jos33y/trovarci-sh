// Credit expiry: per-grant tracking via expires_at + remaining_amount. Backfill via FIFO walk over existing rows.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS expires_at      timestamptz;
    ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS remaining_amount integer;

    -- Partial index: only grants that still have unused credits. Used by the expiry worker query.
    CREATE INDEX IF NOT EXISTS ct_expires_remaining_idx
      ON credit_transactions (expires_at)
      WHERE remaining_amount > 0;

    -- Backfill expires_at for historical positive grants: 12 months from creation.
    UPDATE credit_transactions
    SET expires_at = created_at + INTERVAL '12 months'
    WHERE delta > 0
      AND expires_at IS NULL;

    -- Backfill remaining_amount via FIFO walk per user. For each positive grant,
    -- remaining = max(0, min(delta, running_total - total_user_spend)) where
    -- running_total is the cumulative grant amount up to and including this row.
    -- Result: oldest grants get consumed first; newest grants keep most/all of their delta.
    WITH user_grants AS (
      SELECT
        id,
        user_id,
        delta,
        SUM(delta) OVER (PARTITION BY user_id ORDER BY created_at, id) AS running_total
      FROM credit_transactions
      WHERE delta > 0
    ),
    user_spend AS (
      SELECT user_id, ABS(SUM(delta))::int AS spent
      FROM credit_transactions
      WHERE delta < 0
      GROUP BY user_id
    )
    UPDATE credit_transactions ct
    SET remaining_amount = GREATEST(
      0,
      LEAST(ug.delta, ug.running_total - COALESCE(us.spent, 0))
    )
    FROM user_grants ug
    LEFT JOIN user_spend us ON us.user_id = ug.user_id
    WHERE ct.id = ug.id
      AND ct.remaining_amount IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS ct_expires_remaining_idx;
    ALTER TABLE credit_transactions DROP COLUMN IF EXISTS remaining_amount;
    ALTER TABLE credit_transactions DROP COLUMN IF EXISTS expires_at;
  `);
};
