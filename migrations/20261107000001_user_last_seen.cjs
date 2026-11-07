// When each user last signed in and was last active, kept on the user so it survives session
// cleanup (sessions are deleted a day after they expire or are signed out). Filled once from
// the sessions still on file and from signed-in page views, so admin doesn't start from zero.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN last_login_at  TIMESTAMPTZ,
      ADD COLUMN last_active_at TIMESTAMPTZ;
  `);

  pgm.sql(`
    UPDATE users u SET
      last_login_at = (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id),
      last_active_at = GREATEST(
        (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id),
        (SELECT MAX(a.created_at) FROM analytics_events a WHERE a.user_id = u.id)
      );
  `);

  pgm.sql('CREATE INDEX users_last_active_at ON users (last_active_at DESC NULLS LAST) WHERE deleted_at IS NULL;');
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS users_last_active_at;');
  pgm.sql('ALTER TABLE users DROP COLUMN IF EXISTS last_active_at, DROP COLUMN IF EXISTS last_login_at;');
};
