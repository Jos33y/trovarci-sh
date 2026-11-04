// Sender license orders: one order per purchase, one payment row per gateway invoice or checkout,
// and system rows in admin_actions for licenses issued and revoked without an admin.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE license_orders (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            uuid REFERENCES users(id) ON DELETE RESTRICT,
      email              citext NOT NULL,
      product            text NOT NULL DEFAULT 'sender' CHECK (product IN ('sender')),
      price_key          text NOT NULL CHECK (price_key IN ('launch', 'list', 'test')),
      amount_usd_cents   integer NOT NULL CHECK (amount_usd_cents > 0),
      gateway            text NOT NULL CHECK (gateway IN ('cryptomus', 'polar')),
      status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'refunded')),
      access_token_hash  bytea NOT NULL,
      license_id         uuid REFERENCES licenses(id) ON DELETE RESTRICT,
      payment_reference  text,
      key_email_sent_at  timestamptz,
      key_email_error    text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      paid_at            timestamptz,
      refunded_at        timestamptz,

      CONSTRAINT lo_email_shape CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'),
      CONSTRAINT lo_paid_shape CHECK (
        (status = 'open' AND license_id IS NULL AND paid_at IS NULL) OR
        (status IN ('paid', 'refunded') AND license_id IS NOT NULL AND paid_at IS NOT NULL
          AND user_id IS NOT NULL AND payment_reference IS NOT NULL)
      ),
      CONSTRAINT lo_refunded_shape CHECK ((status = 'refunded') = (refunded_at IS NOT NULL))
    );

    CREATE UNIQUE INDEX lo_license_uniq ON license_orders(license_id) WHERE license_id IS NOT NULL;
    CREATE INDEX lo_user_idx ON license_orders(user_id, created_at DESC);
    CREATE INDEX lo_email_idx ON license_orders(email, created_at DESC);

    CREATE TRIGGER license_orders_set_updated_at
      BEFORE UPDATE ON license_orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // gateway_order_id is what the gateway knows the attempt by: the Cryptomus order_id, or the
  // Polar checkout's metadata. A reopened Cryptomus invoice keeps its row and its order_id.
  pgm.sql(`
    CREATE TABLE license_order_payments (
      id                 bigserial PRIMARY KEY,
      order_id           uuid NOT NULL REFERENCES license_orders(id) ON DELETE RESTRICT,
      gateway            text NOT NULL CHECK (gateway IN ('cryptomus', 'polar')),
      gateway_order_id   text NOT NULL,
      gateway_reference  text,
      status             text NOT NULL DEFAULT 'creating' CHECK (status IN (
                           'creating', 'open', 'confirming', 'partial', 'paid',
                           'underpaid', 'expired', 'failed', 'refunded')),
      amount_usd_cents   integer NOT NULL CHECK (amount_usd_cents > 0),
      paid_usd_cents     integer NOT NULL DEFAULT 0 CHECK (paid_usd_cents >= 0),
      checkout_url       text,
      expires_at         timestamptz,
      txid               text,
      payer_currency     text,
      payer_amount       text,
      gateway_status     text,
      raw_webhook        jsonb,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX lop_gateway_order_uniq ON license_order_payments(gateway, gateway_order_id);
    CREATE UNIQUE INDEX lop_gateway_ref_uniq ON license_order_payments(gateway, gateway_reference)
      WHERE gateway_reference IS NOT NULL;
    CREATE INDEX lop_order_idx ON license_order_payments(order_id, id);

    CREATE TRIGGER license_order_payments_set_updated_at
      BEFORE UPDATE ON license_order_payments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // A license issued by a webhook has no admin behind it. actor_kind says so, and a system row
  // may have no actor; an admin row still must.
  pgm.sql(`
    ALTER TABLE admin_actions ALTER COLUMN actor_id DROP NOT NULL;
    ALTER TABLE admin_actions ADD COLUMN actor_kind text NOT NULL DEFAULT 'admin';
    ALTER TABLE admin_actions ADD CONSTRAINT aa_actor_kind_valid CHECK (actor_kind IN ('admin', 'system'));
    ALTER TABLE admin_actions ADD CONSTRAINT aa_actor_present CHECK (
      (actor_kind = 'admin' AND actor_id IS NOT NULL) OR
      (actor_kind = 'system' AND actor_id IS NULL)
    );

    CREATE UNIQUE INDEX aa_license_order_issue_uniq
      ON admin_actions ((context->>'order_id'))
      WHERE action_type = 'license_issue' AND actor_kind = 'system';
  `);

  // Second lock on the same door: two licenses can never carry the same system payment reference.
  pgm.sql(`
    CREATE UNIQUE INDEX licenses_order_payment_uniq
      ON licenses(payment_reference)
      WHERE issued_by IS NULL AND payment_reference IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS licenses_order_payment_uniq;
    DROP INDEX IF EXISTS aa_license_order_issue_uniq;
    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_actor_present;
    ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS aa_actor_kind_valid;
    ALTER TABLE admin_actions DROP COLUMN IF EXISTS actor_kind;
    ALTER TABLE admin_actions ALTER COLUMN actor_id SET NOT NULL;
    DROP TABLE IF EXISTS license_order_payments;
    DROP TABLE IF EXISTS license_orders;
  `);
};
