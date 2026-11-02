// Allows 'polar' as a payment gateway next to Cryptomus and Stripe.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS pay_gateway_valid;
    ALTER TABLE payments ADD CONSTRAINT pay_gateway_valid CHECK (gateway IN ('cryptomus', 'stripe', 'polar'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS pay_gateway_valid;
    ALTER TABLE payments ADD CONSTRAINT pay_gateway_valid CHECK (gateway IN ('cryptomus', 'stripe'));
  `);
};
