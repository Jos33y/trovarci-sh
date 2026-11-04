// One list of every sale for admin: Credits payments and Sender license orders, in the payments shape.
// A license order's status reads like a payment's: paid is confirmed, and an open order takes its
// latest attempt's state.

const VIEW = `
  CREATE VIEW sales AS
  SELECT p.id, 'credits'::text AS product, p.gateway, p.status, p.package_key, p.credits,
         p.amount_usd_cents, p.created_at, p.completed_at, p.user_id, NULL::citext AS email,
         '/admin/payments/' || p.id::text AS admin_link
  FROM payments p
  UNION ALL
  SELECT o.id, 'sender'::text, o.gateway,
         CASE o.status
           WHEN 'paid' THEN 'confirmed'
           WHEN 'refunded' THEN 'refunded'
           ELSE COALESCE((
             SELECT CASE lp.status
                      WHEN 'expired' THEN 'expired'
                      WHEN 'failed' THEN 'failed'
                      WHEN 'creating' THEN 'pending'
                      ELSE 'awaiting_payment'
                    END
             FROM license_order_payments lp
             WHERE lp.order_id = o.id
             ORDER BY lp.id DESC
             LIMIT 1), 'pending')
         END,
         'sender'::text, NULL::int, o.amount_usd_cents, o.created_at, o.paid_at, o.user_id, o.email,
         '/admin/licenses?q=' || COALESCE(o.license_id::text, o.email::text)
  FROM license_orders o
`;

exports.up = (pgm) => {
  pgm.sql(VIEW);
};

exports.down = (pgm) => {
  pgm.sql('DROP VIEW IF EXISTS sales;');
};
