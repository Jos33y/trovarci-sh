/**
 * admin_actions audit log.
 *
 * Append-only record of every mutation an admin performs through the
 * /admin surface. Every credit grant, every refund, every job cancel,
 * every error mark-resolved writes one row here BEFORE the underlying
 * mutation commits. Read-only views (loaders) never write to this table.
 *
 * The table is the auditor's view of "who did what to whom and why."
 * It is intentionally separate from credit_transactions (the credit
 * ledger) because:
 *   - credit_transactions captures the financial mutation;
 *     admin_actions captures the human decision that caused it.
 *   - One admin_action can correspond to multiple credit_transactions
 *     (e.g. a refund that reverses a multi-line purchase).
 *   - admin_actions covers non-credit mutations too (job cancels,
 *     error resolutions, future user lock/unlock).
 *
 * Schema rules:
 *   - Append-only at the application layer (we never UPDATE / DELETE).
 *     Postgres-level immutability is achieved by NOT granting UPDATE/DELETE
 *     to the application role in production. (Optional hardening; not
 *     enforced here because we use a single role for simplicity.)
 *   - actor_id NOT NULL - we never log a server-initiated action here.
 *     Server actions belong in error_events / analytics_events.
 *   - target_user_id nullable - some actions (e.g. resolving a global
 *     error) have no target user.
 *   - context JSONB carries the typed payload of the mutation
 *     (amount_cents, reason, original_transaction_id, etc).
 *   - reason TEXT is the human-entered "why" - mandatory at the UI level
 *     for irreversible mutations (refunds, force-cancels), optional
 *     elsewhere. We don't enforce NOT NULL because some actions are
 *     self-explanatory and forcing a reason produces useless boilerplate.
 *
 * Indexes:
 *   - by created_at DESC for the admin feed
 *   - by actor_id for "who did what" reports
 *   - by target_user_id for "what was done to this user" tabs
 *   - by action_type for filtered audits
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE admin_actions (
      id              BIGSERIAL    PRIMARY KEY,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
      actor_id        UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action_type     TEXT         NOT NULL,
      target_user_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
      target_kind     TEXT,
      target_id       TEXT,
      reason          TEXT,
      context         JSONB        NOT NULL DEFAULT '{}'::jsonb,

      CONSTRAINT aa_action_type_valid CHECK (action_type IN (
        'credit_grant',
        'credit_refund',
        'credit_adjustment',
        'job_cancel',
        'payment_mark_failed',
        'error_mark_resolved',
        'user_role_change'
      )),
      CONSTRAINT aa_target_kind_valid CHECK (
        target_kind IS NULL OR target_kind IN (
          'user', 'payment', 'job', 'transaction', 'error_event'
        )
      ),
      CONSTRAINT aa_actor_not_target CHECK (
        target_user_id IS NULL OR actor_id <> target_user_id
      )
    );
  `);

  pgm.sql(`
    CREATE INDEX aa_created_at
      ON admin_actions (created_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX aa_actor
      ON admin_actions (actor_id, created_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX aa_target_user
      ON admin_actions (target_user_id, created_at DESC)
      WHERE target_user_id IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX aa_action_type
      ON admin_actions (action_type, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS admin_actions;`);
};
