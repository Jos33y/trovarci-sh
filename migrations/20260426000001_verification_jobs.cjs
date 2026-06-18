/**
 * Verification jobs migration.
 *
 * Foundation for the Email Verifier bulk pipeline (Tool 6) and, later, the
 * Phone Verifier bulk revival. Single-mode runs are NOT recorded here -
 * those execute inline against the same lib module without a row of their
 * own. Only bulk jobs need the queue.
 *
 * Three tables:
 *
 *   verification_jobs
 *     The job header: ownership, status, totals, credit hold, R2 keys for
 *     input/output CSVs. One row per CSV upload.
 *
 *   verification_job_items
 *     One row per email in a job. The worker claims rows via FOR UPDATE
 *     SKIP LOCKED, processes, writes back. Graylisted rows get a
 *     next_retry timestamp and re-enter the claim queue when due.
 *     BIGSERIAL id (not UUID) because this table sees the highest write
 *     volume by far - a 50,000-row job inserts 50,000 items.
 *
 *   domain_catchall_cache
 *     Per-domain catch-all status with TTL. Catch-all detection probes a
 *     random local part once per domain per cache window (24h default).
 *     Without this cache, a 50,000-row job at one corporate domain
 *     would probe the same MX 50,000 times - guaranteed IP block.
 *
 * Why TEXT + CHECK constraints over enums:
 *   Same rationale as credit_transactions.type. Postgres enums can't be
 *   dropped from; adding values requires ALTER TYPE per value. TEXT +
 *   CHECK is the same safety with zero migration pain when the team
 *   adds 'paused' or 'verified' later.
 *
 * Why expires_at on verification_jobs:
 *   48h CSV retention per spec. Cleanup task drops jobs (and via
 *   ON DELETE CASCADE, their items) where expires_at < now(). The
 *   retention is for the OUTPUT CSV download, not the job lifetime
 *   itself - jobs go terminal long before they expire.
 *
 * Why the partial index on (next_retry, id) WHERE status = 'pending':
 *   The worker's claim query is the hot path. It selects pending items
 *   where (next_retry IS NULL OR next_retry <= now()) ordered by retry
 *   schedule then id, locked with FOR UPDATE SKIP LOCKED. NULLS FIRST
 *   ordering on next_retry puts immediate work ahead of retries. The
 *   partial filter keeps the index small even when 100k items have been
 *   processed.
 */

exports.up = (pgm) => {
  // -----------------------------------------------------------------------
  // verification_jobs
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE verification_jobs (
      id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type                   TEXT         NOT NULL,
      status                 TEXT         NOT NULL DEFAULT 'pending',
      total_rows             INTEGER      NOT NULL,
      processed_rows         INTEGER      NOT NULL DEFAULT 0,
      credits_held           INTEGER      NOT NULL DEFAULT 0,
      hold_transaction_id    UUID,
      csv_input_key          TEXT,
      csv_output_key         TEXT,
      metadata               JSONB        NOT NULL DEFAULT '{}'::jsonb,
      created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
      started_at             TIMESTAMPTZ,
      completed_at           TIMESTAMPTZ,
      expires_at             TIMESTAMPTZ  NOT NULL,

      CONSTRAINT vj_type_valid          CHECK (type IN ('email', 'phone')),
      CONSTRAINT vj_status_valid        CHECK (status IN (
        'pending', 'processing', 'complete', 'partial', 'failed', 'cancelled'
      )),
      CONSTRAINT vj_total_positive      CHECK (total_rows > 0),
      CONSTRAINT vj_processed_bound     CHECK (processed_rows >= 0 AND processed_rows <= total_rows),
      CONSTRAINT vj_credits_held_nonneg CHECK (credits_held >= 0),
      CONSTRAINT vj_completed_when_terminal CHECK (
        (status IN ('complete', 'partial', 'failed', 'cancelled') AND completed_at IS NOT NULL) OR
        (status IN ('pending', 'processing'))
      )
    );
  `);

  pgm.sql(`
    CREATE INDEX vj_user_created
      ON verification_jobs (user_id, created_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX vj_status_active
      ON verification_jobs (status)
      WHERE status IN ('pending', 'processing');
  `);

  pgm.sql(`
    CREATE INDEX vj_expires_cleanup
      ON verification_jobs (expires_at);
  `);

  pgm.sql(`
    CREATE TRIGGER verification_jobs_set_updated_at
      BEFORE UPDATE ON verification_jobs
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);

  // -----------------------------------------------------------------------
  // verification_job_items
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE verification_job_items (
      id            BIGSERIAL    PRIMARY KEY,
      job_id        UUID         NOT NULL REFERENCES verification_jobs(id) ON DELETE CASCADE,
      row_index     INTEGER      NOT NULL,
      input         TEXT         NOT NULL,
      status        TEXT         NOT NULL DEFAULT 'pending',
      category      TEXT,
      subcategory   TEXT,
      smtp_response TEXT,
      result        JSONB        NOT NULL DEFAULT '{}'::jsonb,
      attempts      SMALLINT     NOT NULL DEFAULT 0,
      next_retry    TIMESTAMPTZ,
      claimed_at    TIMESTAMPTZ,
      processed_at  TIMESTAMPTZ,
      error_code    TEXT,

      CONSTRAINT vji_status_valid CHECK (status IN ('pending', 'processing', 'done', 'error')),
      CONSTRAINT vji_category_valid CHECK (
        category IS NULL OR category IN ('valid', 'invalid', 'risky', 'unknown')
      ),
      CONSTRAINT vji_subcategory_valid CHECK (
        subcategory IS NULL OR subcategory IN ('catchall', 'disposable', 'role', 'free_provider')
      ),
      CONSTRAINT vji_attempts_bound CHECK (attempts BETWEEN 0 AND 10),
      CONSTRAINT vji_row_index_nonneg CHECK (row_index >= 0)
    );
  `);

  pgm.sql(`
    CREATE INDEX vji_job_status
      ON verification_job_items (job_id, status);
  `);

  // Hot path: worker claim query. Partial index, ordered to put immediate
  // work (next_retry NULL) before retry slots.
  pgm.sql(`
    CREATE INDEX vji_claim
      ON verification_job_items (next_retry NULLS FIRST, id)
      WHERE status = 'pending';
  `);

  pgm.sql(`
    CREATE INDEX vji_job_row_order
      ON verification_job_items (job_id, row_index);
  `);

  // -----------------------------------------------------------------------
  // domain_catchall_cache
  //
  // Domain is the natural primary key. ON CONFLICT (domain) DO UPDATE makes
  // the upsert path a single round-trip. detected_via tracks how the
  // verdict was reached so an admin can audit if a domain shows up
  // disputed in support tickets.
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE domain_catchall_cache (
      domain        TEXT         PRIMARY KEY,
      is_catchall   BOOLEAN      NOT NULL,
      detected_via  TEXT         NOT NULL DEFAULT 'rcpt_random',
      last_checked  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      expires_at    TIMESTAMPTZ  NOT NULL,

      CONSTRAINT dcc_detected_via_valid CHECK (detected_via IN (
        'rcpt_random', 'manual_admin', 'imported'
      ))
    );
  `);

  pgm.sql(`
    CREATE INDEX dcc_expires
      ON domain_catchall_cache (expires_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS domain_catchall_cache;`);
  pgm.sql(`DROP TABLE IF EXISTS verification_job_items;`);
  pgm.sql(`DROP TRIGGER IF EXISTS verification_jobs_set_updated_at ON verification_jobs;`);
  pgm.sql(`DROP TABLE IF EXISTS verification_jobs;`);
};
