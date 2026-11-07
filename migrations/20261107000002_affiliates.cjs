// Affiliate program: affiliates, the commission each referred sale earns, and USDT payouts.
// A commission can be withdrawn 15 days after the sale (the refund window). Every new or
// changed wallet gets a $1 test payout the affiliate confirms before any real payout.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE affiliates (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      code                TEXT         NOT NULL UNIQUE,
      status              TEXT         NOT NULL DEFAULT 'active',
      wallet_network      TEXT,
      wallet_address      TEXT,
      wallet_verified_at  TIMESTAMPTZ,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT affiliates_code_shape     CHECK (code ~ '^[a-z0-9]{4,24}$'),
      CONSTRAINT affiliates_status_valid   CHECK (status IN ('active', 'paused')),
      CONSTRAINT affiliates_network_valid  CHECK (wallet_network IS NULL OR wallet_network IN ('trc20', 'erc20'))
    );

    ALTER TABLE license_orders
      ADD COLUMN affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

    CREATE TABLE affiliate_payouts (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      affiliate_id  UUID         NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
      kind          TEXT         NOT NULL,
      amount_cents  INTEGER      NOT NULL,
      network       TEXT         NOT NULL,
      address       TEXT         NOT NULL,
      status        TEXT         NOT NULL DEFAULT 'requested',
      tx_hash       TEXT,
      note          TEXT,
      sent_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
      requested_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      sent_at       TIMESTAMPTZ,
      confirmed_at  TIMESTAMPTZ,
      CONSTRAINT ap_kind_valid    CHECK (kind IN ('test', 'withdrawal')),
      CONSTRAINT ap_status_valid  CHECK (status IN ('requested', 'sent', 'confirmed', 'failed', 'cancelled')),
      CONSTRAINT ap_amount_pos    CHECK (amount_cents > 0)
    );

    -- One open request of each kind per affiliate.
    CREATE UNIQUE INDEX affiliate_payouts_one_open
      ON affiliate_payouts (affiliate_id, kind) WHERE status = 'requested';

    CREATE TABLE affiliate_commissions (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      affiliate_id  UUID         NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
      order_id      UUID         NOT NULL UNIQUE REFERENCES license_orders(id) ON DELETE CASCADE,
      sale_cents    INTEGER      NOT NULL,
      rate_bp       INTEGER      NOT NULL,
      amount_cents  INTEGER      NOT NULL,
      status        TEXT         NOT NULL DEFAULT 'pending',
      available_at  TIMESTAMPTZ  NOT NULL,
      payout_id     UUID         REFERENCES affiliate_payouts(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
      voided_at     TIMESTAMPTZ,
      CONSTRAINT ac_status_valid CHECK (status IN ('pending', 'paid', 'void')),
      CONSTRAINT ac_amount_pos   CHECK (amount_cents > 0)
    );

    CREATE INDEX affiliate_commissions_by_affiliate ON affiliate_commissions (affiliate_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS affiliate_commissions;
    DROP TABLE IF EXISTS affiliate_payouts;
    ALTER TABLE license_orders DROP COLUMN IF EXISTS affiliate_id;
    DROP TABLE IF EXISTS affiliates;
  `);
};
