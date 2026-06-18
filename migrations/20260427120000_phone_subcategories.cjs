/**
 * Phone subcategory CHECK constraint expansion.
 *
 * The Email Verifier batch added eight email subcategories to
 * vji_subcategory_valid (syntax, no_mx, catchall, mailbox, disposable,
 * role, free_provider, greylist). Phone bulk verification needs a
 * different vocabulary that the existing constraint rejects:
 *
 *   mobile          - line type confirmed mobile (SMS-capable)
 *   landline        - line type confirmed fixed-line (no SMS)
 *   voip            - line type confirmed VoIP (Twilio, Google Voice, etc.)
 *   unreachable     - Twilio responded but no carrier data / number not assigned
 *   format_invalid  - libphonenumber rejected the input (Tier 1 fail)
 *   lookup_failed   - Twilio responded with partial / unknown line type
 *
 * Same expand-the-constraint pattern as the email subcategory_fix
 * migration. Existing email rows are unaffected; their subcategory
 * values still satisfy the new constraint.
 *
 * Why one combined column instead of (type, subcategory):
 *   The vocabulary sets do not overlap and the column is informational
 *   - it never appears in a JOIN or WHERE condition that conflates
 *   types. Splitting would also break tickJobProgress and the results
 *   CSV exporter, both of which read subcategory as a single TEXT.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE verification_job_items
      DROP CONSTRAINT vji_subcategory_valid;
  `);
  pgm.sql(`
    ALTER TABLE verification_job_items
      ADD CONSTRAINT vji_subcategory_valid CHECK (
        subcategory IS NULL OR subcategory IN (
          -- Email subcategories (from prior migration).
          'syntax',
          'no_mx',
          'catchall',
          'mailbox',
          'disposable',
          'role',
          'free_provider',
          'greylist',
          -- Phone subcategories (new in this migration).
          'mobile',
          'landline',
          'voip',
          'unreachable',
          'format_invalid',
          'lookup_failed'
        )
      );
  `);
};

exports.down = (pgm) => {
  // Restore the email-only constraint. WARNING: this will FAIL if any
  // verification_job_items rows have been written with phone subcategories.
  // Drop those rows first or this migration will roll back.
  pgm.sql(`
    ALTER TABLE verification_job_items
      DROP CONSTRAINT vji_subcategory_valid;
  `);
  pgm.sql(`
    ALTER TABLE verification_job_items
      ADD CONSTRAINT vji_subcategory_valid CHECK (
        subcategory IS NULL OR subcategory IN (
          'syntax',
          'no_mx',
          'catchall',
          'mailbox',
          'disposable',
          'role',
          'free_provider',
          'greylist'
        )
      );
  `);
};
