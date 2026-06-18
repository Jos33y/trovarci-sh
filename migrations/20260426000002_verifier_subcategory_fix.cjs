/**
 * Verifier subcategory CHECK constraint fix.
 *
 * The Batch 1 migration's vji_subcategory_valid was too restrictive: it
 * only accepted ('catchall', 'disposable', 'role', 'free_provider'). The
 * Batch 2 lib (app/lib/emailVerify.server.js) classifies into eight
 * subcategories - the four above plus four more that the original
 * constraint rejected:
 *
 *   syntax       - email failed RFC syntax check
 *   no_mx        - domain has no MX records
 *   mailbox      - RCPT TO rejected with "no such user" / "mailbox unavailable"
 *   greylist     - 4xx temporary deferral (graylisting)
 *
 * Caught by scripts/verifyBatch02.mjs writing subcategory='mailbox' to a
 * verification_job_items row in the smoke-test markItemDone path.
 *
 * The fix expands the constraint rather than weakening the taxonomy in
 * the lib. Each of the eight values carries information we need for
 * refund decisions, downstream analytics, and the result UI.
 *
 * Same name, expanded value list. Existing rows are unaffected: NULL
 * subcategories satisfy both old and new constraint.
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

exports.down = (pgm) => {
  // Restore the original Batch 1 constraint. WARNING: this will fail if
  // any rows have been written with one of the new subcategories.
  pgm.sql(`
    ALTER TABLE verification_job_items
      DROP CONSTRAINT vji_subcategory_valid;
  `);
  pgm.sql(`
    ALTER TABLE verification_job_items
      ADD CONSTRAINT vji_subcategory_valid CHECK (
        subcategory IS NULL OR subcategory IN (
          'catchall', 'disposable', 'role', 'free_provider'
        )
      );
  `);
};
