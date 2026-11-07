// Thumbs-up counts for services we may offer ("Rather have it set up for you?").
// A thumbs-up is an ordinary analytics event, `interest` with { id }, sent by the browser.
// The count is the number of different visitors: one per visitor per day at most, bots and
// our own visits excluded. Nothing about the visitor is asked for or kept beyond that.

import { sql } from './db.server.js';

export async function interestCount(id) {
  if (!id) return 0;
  try {
    const [row] = await sql`
      SELECT COUNT(DISTINCT session_hash)::int AS n
      FROM analytics_events
      WHERE event_type = 'interest' AND metadata->>'id' = ${id}
        AND is_bot = FALSE AND is_internal = FALSE
    `;
    return row?.n ?? 0;
  } catch (err) {
    console.error('[interest] count failed', err.message);
    return 0;
  }
}
