// Extend admin_actions check constraints to allow contact_message_status_change action + contact_message target.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_action_type_valid;
    ALTER TABLE admin_actions ADD CONSTRAINT aa_action_type_valid
      CHECK (action_type IN (
        'credit_grant',
        'credit_refund',
        'credit_adjustment',
        'job_cancel',
        'payment_mark_failed',
        'error_mark_resolved',
        'user_role_change',
        'contact_message_status_change'
      ));

    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_target_kind_valid;
    ALTER TABLE admin_actions ADD CONSTRAINT aa_target_kind_valid
      CHECK (target_kind IS NULL OR target_kind IN (
        'user', 'payment', 'job', 'transaction', 'error_event', 'contact_message'
      ));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_action_type_valid;
    ALTER TABLE admin_actions ADD CONSTRAINT aa_action_type_valid
      CHECK (action_type IN (
        'credit_grant',
        'credit_refund',
        'credit_adjustment',
        'job_cancel',
        'payment_mark_failed',
        'error_mark_resolved',
        'user_role_change'
      ));

    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_target_kind_valid;
    ALTER TABLE admin_actions ADD CONSTRAINT aa_target_kind_valid
      CHECK (target_kind IS NULL OR target_kind IN (
        'user', 'payment', 'job', 'transaction', 'error_event'
      ));
  `);
};
