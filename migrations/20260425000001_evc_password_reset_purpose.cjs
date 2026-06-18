/**
 * Migration: extend evc_purpose_valid CHECK constraint to allow 'password_reset'
 *
 * Background:
 *   The auth_baseline migration created `email_verification_codes` with
 *   `CHECK (purpose IN ('signup', 'email_change', 'reauth'))`. Adding
 *   the password reset flow needs 'password_reset' to be valid too.
 *
 *   Postgres has no "add value to existing CHECK constraint" syntax. The
 *   only path is DROP + recreate, and the new constraint must accept
 *   every existing row's value or Postgres rejects the ALTER with
 *   "violated by some row".
 *
 * What this changes:
 *   OLD vocabulary: 'signup', 'email_change', 'reauth'
 *   NEW vocabulary: 'signup', 'email_change', 'reauth', 'password_reset'
 *
 *   No data migration needed. Existing rows keep their values. The
 *   new constraint is a strict superset.
 *
 * Reversibility:
 *   The DOWN path restores the original three-value constraint. If any
 *   rows with `purpose = 'password_reset'` exist when DOWN runs, it
 *   will fail. That is correct behavior - rolling back this migration
 *   with active password reset codes would orphan them.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE email_verification_codes
    DROP CONSTRAINT IF EXISTS evc_purpose_valid
  `);

  pgm.sql(`
    ALTER TABLE email_verification_codes
    ADD CONSTRAINT evc_purpose_valid
    CHECK (purpose IN ('signup', 'email_change', 'reauth', 'password_reset'))
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE email_verification_codes
    DROP CONSTRAINT IF EXISTS evc_purpose_valid
  `);

  pgm.sql(`
    ALTER TABLE email_verification_codes
    ADD CONSTRAINT evc_purpose_valid
    CHECK (purpose IN ('signup', 'email_change', 'reauth'))
  `);
};
