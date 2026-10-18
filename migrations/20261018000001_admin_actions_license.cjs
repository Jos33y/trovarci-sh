// Extend admin_actions check constraints for Sender license issue, revoke and device release.

const ACTIONS_BEFORE = [
  'credit_grant',
  'credit_refund',
  'credit_adjustment',
  'job_cancel',
  'payment_mark_failed',
  'error_mark_resolved',
  'user_role_change',
  'contact_message_status_change',
];
const ACTIONS_AFTER = [...ACTIONS_BEFORE, 'license_issue', 'license_revoke', 'license_device_release'];

const KINDS_BEFORE = ['user', 'payment', 'job', 'transaction', 'error_event', 'contact_message'];
const KINDS_AFTER = [...KINDS_BEFORE, 'license'];

const list = (values) => values.map((v) => `'${v}'`).join(', ');

function constraints(actions, kinds) {
  return `
    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_action_type_valid;
    ALTER TABLE admin_actions ADD CONSTRAINT aa_action_type_valid
      CHECK (action_type IN (${list(actions)}));

    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_target_kind_valid;
    ALTER TABLE admin_actions ADD CONSTRAINT aa_target_kind_valid
      CHECK (target_kind IS NULL OR target_kind IN (${list(kinds)}));
  `;
}

exports.up = (pgm) => {
  pgm.sql(constraints(ACTIONS_AFTER, KINDS_AFTER));

  // One issue per form token. Two racing submits of the same form cannot both commit:
  // the second audit insert fails and its license row rolls back with it.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS aa_license_issue_token_uniq
      ON admin_actions ((context->>'issue_token'))
      WHERE action_type = 'license_issue' AND context ? 'issue_token';
  `);
};

// Down fails while license rows exist in admin_actions, which is the point: the audit
// trail is not rewritten to make a rollback fit.
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS aa_license_issue_token_uniq;`);
  pgm.sql(constraints(ACTIONS_BEFORE, KINDS_BEFORE));
};
