/**
 * Payments migration.
 *
 * Creates the `payments` table - a gateway-agnostic record of every payment
 * attempt. One row per checkout session, regardless of whether Cryptomus or
 * Stripe fulfills it.
 *
 * Design decisions:
 *
 *   - `id` is a UUID, and we use this as the Cryptomus `order_id` when
 *     creating invoices. Cryptomus requires order_id uniqueness; UUID gives
 *     us that for free across all time.
 *
 *   - `gateway_reference` stores the gateway's own id (Cryptomus invoice UUID,
 *     Stripe session id). UNIQUE partial index so nulls don't collide during
 *     the brief window between payment row creation and gateway call.
 *
 *   - `status` follows a strict state machine enforced at the application
 *     layer:
 *        pending -> awaiting_payment -> confirmed | failed | expired
 *                                    -> refunded (terminal, from confirmed)
 *     We allow direct pending -> failed for gateway creation errors.
 *
 *   - `amount_usd` stored as INTEGER cents (never floats for money).
 *     `credits` is the credit amount being purchased (also integer).
 *
 *   - `completed_at` is set when the payment reaches a terminal state and
 *     credits are granted. NULL during pending/awaiting. Used by the idempotency
 *     check in the webhook handler.
 *
 *   - `metadata` JSONB for gateway-specific details (customer email, payer
 *     currency, txid, etc.) that don't warrant their own column.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE payments (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      gateway             TEXT         NOT NULL,
      gateway_reference   TEXT,
      status              TEXT         NOT NULL DEFAULT 'pending',
      amount_usd_cents    INTEGER      NOT NULL,
      credits             INTEGER      NOT NULL,
      package_key         TEXT         NOT NULL,
      payer_currency      TEXT,
      payer_amount        TEXT,
      txid                TEXT,
      metadata            JSONB        NOT NULL DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
      completed_at        TIMESTAMPTZ,

      CONSTRAINT pay_gateway_valid CHECK (gateway IN ('cryptomus', 'stripe')),
      CONSTRAINT pay_status_valid  CHECK (status IN (
        'pending',
        'awaiting_payment',
        'confirmed',
        'failed',
        'expired',
        'refunded'
      )),
      CONSTRAINT pay_amount_positive  CHECK (amount_usd_cents > 0),
      CONSTRAINT pay_credits_positive CHECK (credits > 0),
      CONSTRAINT pay_completed_when_terminal CHECK (
        (status IN ('confirmed', 'refunded') AND completed_at IS NOT NULL) OR
        (status IN ('pending', 'awaiting_payment', 'failed', 'expired'))
      )
    );
  `);

  pgm.sql(`
    CREATE INDEX pay_user_created
      ON payments (user_id, created_at DESC);
  `);

  // Partial unique index on gateway_reference - prevents duplicate processing
  // of the same gateway invoice, but allows nulls during creation window.
  pgm.sql(`
    CREATE UNIQUE INDEX pay_gateway_reference_uniq
      ON payments (gateway, gateway_reference)
      WHERE gateway_reference IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX pay_status_pending
      ON payments (status, created_at)
      WHERE status IN ('pending', 'awaiting_payment');
  `);

  pgm.sql(`
    CREATE TRIGGER payments_set_updated_at
      BEFORE UPDATE ON payments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;`);
  pgm.sql(`DROP TABLE IF EXISTS payments;`);
};
