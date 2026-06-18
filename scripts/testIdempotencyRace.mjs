// Run: node --env-file=.env scripts/testIdempotencyRace.mjs <userId>
// Fires N concurrent grantCredits with the same referenceId. Expects exactly
// one to win (idempotent:false), the rest to come back idempotent:true,
// and the user balance to increase by EXACTLY one delta.

import { sql } from '../app/utils/db.server.js';
import { grantCredits } from '../app/lib/credits.server.js';

const userId = process.argv[2];
if (!userId) { console.error('usage: testIdempotencyRace.mjs <userId>'); process.exit(1); }

const refId = crypto.randomUUID();
const N = 10;
const AMOUNT = 100;

const [before] = await sql`SELECT credits_balance FROM users WHERE id = ${userId}`;
console.log(`balance before: ${before.credits_balance}`);

const results = await Promise.allSettled(
  Array.from({ length: N }, () =>
    grantCredits(userId, AMOUNT, 'grant', { referenceId: refId, metadata: { test: 'race' } })
  )
);

const [after] = await sql`SELECT credits_balance FROM users WHERE id = ${userId}`;
const ledgerCount = await sql`
  SELECT COUNT(*)::int AS n FROM credit_transactions
  WHERE user_id = ${userId} AND type = 'grant' AND reference_id = ${refId}
`;

const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
const winners = fulfilled.filter(r => !r.idempotent);
const idempotent = fulfilled.filter(r => r.idempotent);
const rejected = results.filter(r => r.status === 'rejected');

console.log(`balance after:  ${after.credits_balance}`);
console.log(`delta:          ${after.credits_balance - before.credits_balance}  (expected: ${AMOUNT})`);
console.log(`winners:        ${winners.length}  (expected: 1)`);
console.log(`idempotent:     ${idempotent.length}  (expected: ${N - 1})`);
console.log(`rejected:       ${rejected.length}  (expected: 0)`);
console.log(`ledger rows:    ${ledgerCount[0].n}  (expected: 1)`);

const ok =
  after.credits_balance - before.credits_balance === AMOUNT &&
  winners.length === 1 &&
  idempotent.length === N - 1 &&
  rejected.length === 0 &&
  ledgerCount[0].n === 1;

console.log(ok ? '\nPASS' : '\nFAIL');
await sql.end();
process.exit(ok ? 0 : 1);
