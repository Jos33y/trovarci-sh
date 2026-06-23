// contact_messages - submissions from /contact page and floating widget. Status enum gates admin triage.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at   timestamptz NOT NULL DEFAULT now(),
      subject      text NOT NULL CHECK (subject IN ('general','payment','bug','feature','partnership','press')),
      name         text NOT NULL,
      email        text NOT NULL,
      message      text NOT NULL,
      user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
      source       text NOT NULL DEFAULT 'page' CHECK (source IN ('page','widget')),
      ip_address   inet,
      user_agent   text,
      status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','spam')),
      notes        text
    );

    CREATE INDEX IF NOT EXISTS contact_messages_status_created_idx
      ON contact_messages(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS contact_messages_email_idx
      ON contact_messages(email);
    CREATE INDEX IF NOT EXISTS contact_messages_user_idx
      ON contact_messages(user_id)
      WHERE user_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS contact_messages;`);
};
