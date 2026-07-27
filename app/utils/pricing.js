// Credit pricing. One credit is one US cent, flat, at every volume.

// The whole model. Credits and cents are the same number, which is what makes
// pricing auditable by inspection and keeps the ledger integer. Volume discounts,
// if ever offered, come via promo codes, never by rate-gating behind a tier name.
export const CREDIT_PRICE_USD_CENTS = 1;

export const PER_CREDIT_LABEL = '$0.010';

// Price is derived from credits, so a pack cannot drift from the rate.
export const CREDIT_PACKAGES = [
  { key: 'starter', name: 'Starter', credits: 500 },
  { key: 'growth',  name: 'Growth',  credits: 2_500, popular: true },
  { key: 'pro',     name: 'Pro',     credits: 10_000 },
  { key: 'scale',   name: 'Scale',   credits: 50_000 },
  { key: 'bulk',    name: 'Bulk',    credits: 100_000 },
].map((p) => ({ ...p, priceUsdCents: p.credits * CREDIT_PRICE_USD_CENTS }));

export const PACKAGE_KEYS = CREDIT_PACKAGES.map((p) => p.key);

export function getPackage(key) {
  return CREDIT_PACKAGES.find((p) => p.key === key) || null;
}

// Integer cents. Flat rate makes this a multiplication and nothing more.
export function customPriceCents(credits) {
  if (!Number.isInteger(credits) || credits <= 0) return 0;
  return credits * CREDIT_PRICE_USD_CENTS;
}

// Whole dollars render without cents so pack cards read "$5" rather than "$5.00".
export function formatUsd(priceUsdCents) {
  const dollars = priceUsdCents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}
