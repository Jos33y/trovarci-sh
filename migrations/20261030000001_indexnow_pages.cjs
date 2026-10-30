// Last content fingerprint IndexNow was told about, per sitemap URL. Lets a deploy ping only pages that changed.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS indexnow_pages (
      url          TEXT        PRIMARY KEY,
      content_hash TEXT        NOT NULL,
      pinged_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS indexnow_pages;`);
};
