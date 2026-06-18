/**
 * Auth baseline migration
 *
 * Creates the four tables needed for Section 01 of the functions backlog:
 *   users                       - account identity, password hash, credits, role
 *   sessions                    - opaque server-side sessions (cookie carries token,
 *                                 DB stores SHA-256 hash of token)
 *   email_verification_codes    - 6-digit codes for signup verification, email
 *                                 changes, and reauthentication
 *   auth_rate_limits            - bucketed counter for login attempt throttling
 *
 * All timestamps are timestamptz. All primary keys are UUID v4 via gen_random_uuid.
 * Emails are citext so 'Foo@bar.com' and 'foo@bar.com' are treated as the same
 * account without application-level lowercasing.
 *
 * Soft delete pattern: deleted_at on users. The email unique index is partial
 * (WHERE deleted_at IS NULL) so a deleted account does not permanently burn its
 * email address.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "citext";
  `);

  // -----------------------------------------------------------------------
  // users
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE users (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      email               CITEXT       NOT NULL,
      password_hash       TEXT         NOT NULL,
      email_verified_at   TIMESTAMPTZ,
      credits_balance     INTEGER      NOT NULL DEFAULT 0,
      role                TEXT         NOT NULL DEFAULT 'user',
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
      deleted_at          TIMESTAMPTZ,

      CONSTRAINT users_role_valid      CHECK (role IN ('user', 'admin')),
      CONSTRAINT users_credits_nonneg  CHECK (credits_balance >= 0),
      CONSTRAINT users_email_shape     CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX users_email_active_uniq
      ON users (email)
      WHERE deleted_at IS NULL;
  `);

  // -----------------------------------------------------------------------
  // sessions
  //
  // token_hash is SHA-256 of the opaque token carried in the cookie. Storing
  // the hash (not the token) means a DB leak does not leak live sessions.
  //
  // last_seen_at updates are gated in application code to fire only when the
  // value is stale by more than 5 minutes. This avoids write amplification on
  // hot session rows.
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE sessions (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash    TEXT         NOT NULL UNIQUE,
      expires_at    TIMESTAMPTZ  NOT NULL,
      revoked_at    TIMESTAMPTZ,
      user_agent    TEXT,
      ip_address    INET,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
      last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE INDEX sessions_user_id_active
      ON sessions (user_id)
      WHERE revoked_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX sessions_cleanup
      ON sessions (expires_at)
      WHERE revoked_at IS NULL;
  `);

  // -----------------------------------------------------------------------
  // email_verification_codes
  //
  // code_hash is HMAC-SHA256(pepper, user_id || ':' || code). The pepper lives
  // in VERIFICATION_CODE_PEPPER env var; rotating it invalidates all live
  // codes, which is the desired behavior during a breach response.
  //
  // attempts caps at 5 via CHECK constraint. The partial unique index ensures
  // at most one unconsumed code per (user, purpose), so resending a code
  // requires the app to mark the prior code consumed in the same transaction.
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE email_verification_codes (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash    TEXT         NOT NULL,
      purpose      TEXT         NOT NULL DEFAULT 'signup',
      expires_at   TIMESTAMPTZ  NOT NULL,
      attempts     SMALLINT     NOT NULL DEFAULT 0,
      consumed_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT evc_purpose_valid   CHECK (purpose IN ('signup', 'email_change', 'reauth')),
      CONSTRAINT evc_attempts_bound  CHECK (attempts BETWEEN 0 AND 5)
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX evc_one_active_per_purpose
      ON email_verification_codes (user_id, purpose)
      WHERE consumed_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX evc_cleanup
      ON email_verification_codes (expires_at)
      WHERE consumed_at IS NULL;
  `);

  // -----------------------------------------------------------------------
  // auth_rate_limits
  //
  // Bucketed counter design: one row per (bucket_key, minute). Increment via
  // upsert. Sliding-window check sums attempts across the relevant minutes.
  // Row count per bucket stays bounded at ~15 rows per 15-minute window
  // regardless of attack volume. Nightly DELETE drops rows older than 24h.
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE auth_rate_limits (
      bucket_key    TEXT         NOT NULL,
      window_start  TIMESTAMPTZ  NOT NULL,
      attempts      INTEGER      NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket_key, window_start),

      CONSTRAINT arl_attempts_positive CHECK (attempts > 0)
    );
  `);

  pgm.sql(`
    CREATE INDEX auth_rate_limits_cleanup
      ON auth_rate_limits (window_start);
  `);

  // -----------------------------------------------------------------------
  // updated_at trigger (reusable)
  // -----------------------------------------------------------------------
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS users_set_updated_at ON users;`);
  pgm.sql(`DROP FUNCTION IF EXISTS set_updated_at();`);
  pgm.sql(`DROP TABLE IF EXISTS auth_rate_limits;`);
  pgm.sql(`DROP TABLE IF EXISTS email_verification_codes;`);
  pgm.sql(`DROP TABLE IF EXISTS sessions;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
  // Leave extensions in place. Dropping citext/pgcrypto would break any other
  // schema in the database that depends on them.
};
