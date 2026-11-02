// Closes card checkouts nobody finished, in case Polar's expiry event never arrives. Payment later still completes them.

import { sql } from '../utils/db.server.js';

const CARD_CHECKOUT_TTL_HOURS = 2;

export async function expireStaleCardCheckouts() {
  const r = await sql`
    UPDATE payments
    SET status = 'expired',
        metadata = metadata || ${sql.json({ expired_by: 'sweep' })}
    WHERE gateway = 'polar'
      AND status IN ('pending', 'awaiting_payment')
      AND created_at < now() - make_interval(hours => ${CARD_CHECKOUT_TTL_HOURS})
  `;
  return r.count || 0;
}
