// Tags the site owner's own visits so reports can leave them out. Existing sessions that included an admin account are tagged now.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE analytics_events SET is_internal = TRUE
    WHERE session_hash IN (
      SELECT DISTINCT e.session_hash
      FROM analytics_events e
      JOIN users u ON u.id = e.user_id
      WHERE u.role = 'admin'
        AND e.session_hash NOT IN ('webhook', 'system', 'bot')
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE analytics_events DROP COLUMN IF EXISTS is_internal;`);
};
