// licenses and license_activations - sender license issuance and per-device binding.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS licenses (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      license_key        text NOT NULL,
      product            text NOT NULL DEFAULT 'sender' CHECK (product IN ('sender')),
      entitlements       integer NOT NULL DEFAULT 0,
      max_devices        smallint NOT NULL DEFAULT 3,
      status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      payment_reference  text,
      issued_by          uuid REFERENCES users(id) ON DELETE SET NULL,
      issued_at          timestamptz NOT NULL DEFAULT now(),
      revoked_at         timestamptz,
      revoked_reason     text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT licenses_devices_bound  CHECK (max_devices BETWEEN 1 AND 50),
      CONSTRAINT licenses_revoked_shape  CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL) OR
        (status = 'active'  AND revoked_at IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS licenses_user_idx ON licenses(user_id, issued_at DESC);
    CREATE INDEX IF NOT EXISTS licenses_status_idx ON licenses(status, issued_at DESC);
  `);

  // The key is the lookup on every activation and check-in, and it is unique by construction.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS licenses_key_uniq ON licenses(license_key);
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS license_activations (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      license_id    uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      device_id     text NOT NULL,
      device_label  text,
      app_version   text,
      platform      text,
      activated_at  timestamptz NOT NULL DEFAULT now(),
      last_seen_at  timestamptz NOT NULL DEFAULT now(),
      released_at   timestamptz,

      CONSTRAINT la_device_id_shape CHECK (char_length(device_id) BETWEEN 8 AND 64)
    );
  `);

  // Partial unique so a released slot can be reclaimed by the same machine later.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS la_one_live_per_device
      ON license_activations(license_id, device_id)
      WHERE released_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS la_license_live_idx
      ON license_activations(license_id)
      WHERE released_at IS NULL;
  `);

  pgm.sql(`
    CREATE TRIGGER licenses_set_updated_at
      BEFORE UPDATE ON licenses
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS licenses_set_updated_at ON licenses;`);
  pgm.sql(`DROP TABLE IF EXISTS license_activations;`);
  pgm.sql(`DROP TABLE IF EXISTS licenses;`);
};
