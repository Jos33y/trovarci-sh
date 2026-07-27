// Adds verification_job_items.billable so refunds can pay back addresses no vendor charged for.

exports.up = (pgm) => {
  // NULL means unknown, which is treated as billable by the refund query. Only an
  // explicit false triggers a refund, so a bug cannot hand out free verifications.
  pgm.sql(`
    ALTER TABLE verification_job_items
      ADD COLUMN billable BOOLEAN;
  `);

  // Refund query counts non-billable done rows per job. Partial index keeps it small.
  pgm.sql(`
    CREATE INDEX vji_job_nonbillable
      ON verification_job_items (job_id)
      WHERE status = 'done' AND billable = false;
  `);

  // Catch-all verdicts from MillionVerifier were being written as 'imported' to satisfy
  // the old CHECK. 'external_api' keeps the audit trail honest about the source.
  pgm.sql(`
    ALTER TABLE domain_catchall_cache
      DROP CONSTRAINT dcc_detected_via_valid;
  `);
  pgm.sql(`
    ALTER TABLE domain_catchall_cache
      ADD CONSTRAINT dcc_detected_via_valid CHECK (
        detected_via IN ('rcpt_random', 'manual_admin', 'imported', 'external_api')
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS vji_job_nonbillable;`);
  pgm.sql(`ALTER TABLE verification_job_items DROP COLUMN IF EXISTS billable;`);

  // Rows written as external_api must move back before the narrower CHECK can apply.
  pgm.sql(`
    UPDATE domain_catchall_cache
    SET detected_via = 'imported'
    WHERE detected_via = 'external_api';
  `);
  pgm.sql(`
    ALTER TABLE domain_catchall_cache
      DROP CONSTRAINT dcc_detected_via_valid;
  `);
  pgm.sql(`
    ALTER TABLE domain_catchall_cache
      ADD CONSTRAINT dcc_detected_via_valid CHECK (
        detected_via IN ('rcpt_random', 'manual_admin', 'imported')
      );
  `);
};
