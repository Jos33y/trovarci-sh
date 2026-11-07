// The affiliate program's terms, in one place for the site, the account page and the server.
// Changing a rate here changes it for new sales only: a commission keeps the rate it was earned at.
// The /affiliates page promises 30 days' notice by email before a change.

export const TIERS = [
  { from: 0, rateBp: 3000 },  // 30% from the first sale
  { from: 10, rateBp: 3500 }, // 35% from the 11th sale (after 10)
  { from: 50, rateBp: 4000 }, // 40% from the 51st sale (after 50)
];

export const HOLD_DAYS = 15;      // the refund window: a commission can be withdrawn after this
export const COOKIE_DAYS = 90;    // a click counts for a sale within this many days; the last click wins
export const TEST_PAYOUT_CENTS = 100; // sent to every new or changed wallet before the first real payout

export const NETWORKS = {
  trc20: { label: 'USDT on Tron (TRC-20)', test: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, example: 'T…' },
  erc20: { label: 'USDT on Ethereum (ERC-20)', test: /^0x[0-9a-fA-F]{40}$/, example: '0x…' },
};

/** The rate for an affiliate's next sale, given how many sales they already have. */
export function rateForSales(salesSoFar) {
  let rate = TIERS[0].rateBp;
  for (const t of TIERS) if (salesSoFar >= t.from) rate = t.rateBp;
  return rate;
}

/** The next tier above the current one, or null at the top. */
export function nextTier(salesSoFar) {
  return TIERS.find((t) => t.from > salesSoFar) || null;
}

export const percent = (bp) => `${bp / 100}%`;
export const commissionCents = (saleCents, rateBp) => Math.round((saleCents * rateBp) / 10000);
