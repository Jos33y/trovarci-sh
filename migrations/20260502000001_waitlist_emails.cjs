/**
 * Waitlist email capture.
 *
 * Backs the desktop-app waitlist on /download AND the dashboard "Trovarcis
 * Reach Desktop" panel. One row per address, regardless of how many times
 * the same person submits across surfaces.
 *
 * Design choices:
 *
 * - Lower-case unique index (not a unique constraint on the column itself)
 *   stores the email verbatim while collapsing 'Foo@Bar.com' and
 *   'foo@bar.com' to the same row. Avoids the "I signed up but you let me
 *   sign up again" confusion.
 *
 * - source is mandatory and free-text. Captures attribution without an
 *   enum (which would require a migration to add 'admin_panel' or
 *   'partner_referral' later). Today: 'download_page' | 'dashboard_panel'.
 *
 * - user_id is nullable. Anonymous waitlist signups from the public
 *   /download page have no user. Logged-in dashboard signups carry their
 *   user_id for later reconciliation when we re-engage.
 *
 * - email regex matches validateEmail() in app/utils/validation.server.js
 *   (RFC-flavoured "has @ and a dot, no spaces"). The CHECK is a defence
 *   in depth against any future code path that bypasses validation.
 *
 * - No DELETE policy here. Keep waitlist forever; pruning policy is
 *   product, not schema.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE waitlist_emails (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      email        TEXT         NOT NULL,
      source       TEXT         NOT NULL,
      user_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
      user_agent   TEXT,
      ip_address   TEXT,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT we_email_format CHECK (
        email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      ),
      CONSTRAINT we_source_nonempty CHECK (length(source) > 0)
    );
  `);

  // Case-insensitive uniqueness. Storing the verbatim address but treating
  // FOO@bar.com and foo@bar.com as the same record.
  pgm.sql(`
    CREATE UNIQUE INDEX we_email_unique_ci
      ON waitlist_emails (lower(email));
  `);

  // For the admin "newest first" listing.
  pgm.sql(`
    CREATE INDEX we_created_idx
      ON waitlist_emails (created_at DESC);
  `);

  // For "is this user on the list" checks tied to a logged-in account.
  pgm.sql(`
    CREATE INDEX we_user_idx
      ON waitlist_emails (user_id)
      WHERE user_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS waitlist_emails;`);
};
