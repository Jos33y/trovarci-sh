#!/usr/bin/env node
// Regression test for the credit pricing model. Run: node --env-file=.env scripts/verifyPricing.mjs

import {
  CREDIT_COSTS,
  bulkEmailVerifyCost,
  bulkPhoneVerifyCost,
  bulkCost,
  WELCOME_BONUS_AMOUNT,
} from '../app/utils/creditsConfig.server.js';

import {
  CREDIT_PACKAGES,
  CREDIT_PRICE_USD_CENTS,
  PACKAGE_KEYS,
  PER_CREDIT_LABEL,
  customPriceCents,
  formatUsd,
  getPackage,
} from '../app/utils/pricing.js';

import {
  CUSTOM_MIN_CREDITS,
  CUSTOM_MAX_CREDITS,
  buildCustomPackage,
} from '../app/utils/paymentsConfig.server.js';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  [OK]   ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  [FAIL] ${label}${detail ? ` - ${detail}` : ''}`);
  failed++;
}

function eq(actual, expected, label) {
  if (actual === expected) ok(`${label} (${actual})`);
  else fail(label, `expected ${expected}, got ${actual}`);
}

function truthy(value, label) {
  if (value) ok(label);
  else fail(label);
}

console.log('\n--- 1. Action costs are flat ---\n');

eq(CREDIT_COSTS.email_verify, 1, 'email_verify cost');
eq(CREDIT_COSTS.phone_verify, 2, 'phone_verify cost');
eq(CREDIT_COSTS.phone_verify_bulk_per_call, 2, 'phone_verify_bulk_per_call cost');
eq(CREDIT_COSTS.email_score, 1, 'email_score cost');
eq(CREDIT_COSTS.domain_check, 0, 'domain_check is free');
eq(CREDIT_COSTS.smtp_test, 0, 'smtp_test is free');
eq(CREDIT_COSTS.dns_generate, 0, 'dns_generate is free');
eq(WELCOME_BONUS_AMOUNT, 10, 'welcome bonus is 10 credits');

// The per-5 discount was the arbitrage: a 5-email job got the same cut as a 50,000-email job.
if ('email_verify_bulk_per_5' in CREDIT_COSTS) {
  fail('legacy email_verify_bulk_per_5 key', 'must be removed');
} else {
  ok('legacy email_verify_bulk_per_5 key removed');
}

console.log('\n--- 2. Bulk cost equals single cost ---\n');

eq(bulkEmailVerifyCost(0), 0, 'bulkEmailVerifyCost(0)');
eq(bulkEmailVerifyCost(1), 1, 'bulkEmailVerifyCost(1)');
eq(bulkEmailVerifyCost(5), 5, 'bulkEmailVerifyCost(5)');
eq(bulkEmailVerifyCost(6), 6, 'bulkEmailVerifyCost(6)');
eq(bulkEmailVerifyCost(50000), 50000, 'bulkEmailVerifyCost(50000)');

for (const n of [1, 7, 250, 9999]) {
  eq(bulkEmailVerifyCost(n), n * CREDIT_COSTS.email_verify, `bulk email ${n} equals single rate`);
}

eq(bulkEmailVerifyCost(-5), 0, 'bulkEmailVerifyCost(-5) returns 0');
eq(bulkEmailVerifyCost(2.5), 0, 'bulkEmailVerifyCost(2.5) returns 0');
eq(bulkEmailVerifyCost('abc'), 0, 'bulkEmailVerifyCost("abc") returns 0');

eq(bulkPhoneVerifyCost(100), 200, 'bulkPhoneVerifyCost(100)');
eq(bulkCost('email', 250), 250, 'bulkCost email 250');
eq(bulkCost('phone', 250), 500, 'bulkCost phone 250');

console.log('\n--- 3. One credit is one cent ---\n');

eq(CREDIT_PRICE_USD_CENTS, 1, 'CREDIT_PRICE_USD_CENTS');
eq(PER_CREDIT_LABEL, '$0.010', 'PER_CREDIT_LABEL');

// The property the whole model rests on: credits and cents are the same number.
let identityOk = true;
for (const c of [100, 500, 2500, 10000, 50000, 100000, 250000, 1000000]) {
  if (customPriceCents(c) !== c) {
    identityOk = false;
    fail(`credits equal cents at ${c}`, `got ${customPriceCents(c)}`);
  }
}
if (identityOk) ok('credits equal cents at every tested amount');

console.log('\n--- 4. Packs ---\n');

eq(CREDIT_PACKAGES.length, 5, 'five packs');
eq(PACKAGE_KEYS.join(','), 'starter,growth,pro,scale,bulk', 'pack keys and order');

const expected = [
  { key: 'starter', credits: 500,    priceUsdCents: 500 },
  { key: 'growth',  credits: 2500,   priceUsdCents: 2500 },
  { key: 'pro',     credits: 10000,  priceUsdCents: 10000 },
  { key: 'scale',   credits: 50000,  priceUsdCents: 50000 },
  { key: 'bulk',    credits: 100000, priceUsdCents: 100000 },
];

for (const want of expected) {
  const pkg = getPackage(want.key);
  if (!pkg) {
    fail(`getPackage('${want.key}')`, 'package missing');
    continue;
  }
  eq(pkg.credits, want.credits, `${want.key} credits`);
  eq(pkg.priceUsdCents, want.priceUsdCents, `${want.key} priceUsdCents`);
}

eq(getPackage('nope'), null, 'getPackage on unknown key returns null');

const popular = CREDIT_PACKAGES.find((p) => p.popular);
truthy(popular?.key === 'growth', 'growth marked as popular');

// Every pack must sit on the flat rate. A pack that does not is a pricing tier.
let flatOk = true;
for (const p of CREDIT_PACKAGES) {
  if (p.priceUsdCents !== p.credits * CREDIT_PRICE_USD_CENTS) {
    flatOk = false;
    fail(`${p.key} sits on the flat rate`, `${p.priceUsdCents} cents for ${p.credits} credits`);
  }
}
if (flatOk) ok('every pack sits on the flat rate, no tier gating');

console.log('\n--- 5. Custom amounts ---\n');

eq(CUSTOM_MIN_CREDITS, 100, 'CUSTOM_MIN_CREDITS');
eq(CUSTOM_MAX_CREDITS, 1000000, 'CUSTOM_MAX_CREDITS');

eq(buildCustomPackage(99), null, 'below min returns null');
eq(buildCustomPackage(1000001), null, 'above max returns null');
eq(buildCustomPackage(2.5), null, 'non-integer returns null');
eq(buildCustomPackage('abc'), null, 'non-numeric returns null');

const cMin = buildCustomPackage(CUSTOM_MIN_CREDITS);
truthy(cMin, 'buildCustomPackage at min returns a package');
if (cMin) eq(cMin.priceUsdCents, 100, '  100 credits costs $1.00');

const cMax = buildCustomPackage(CUSTOM_MAX_CREDITS);
truthy(cMax, 'buildCustomPackage at max returns a package');
if (cMax) eq(cMax.priceUsdCents, 1000000, '  1,000,000 credits costs $10,000.00');

// Custom must never beat or lose to a pack of the same size, or packs become tiers.
let packParity = true;
for (const p of CREDIT_PACKAGES) {
  if (customPriceCents(p.credits) !== p.priceUsdCents) {
    packParity = false;
    fail(`custom at ${p.credits} matches ${p.key}`, `got ${customPriceCents(p.credits)}`);
  }
}
if (packParity) ok('custom at any pack size costs exactly that pack');

// Strictly monotonic: one more credit always costs exactly one more cent.
let stepOk = true;
let prev = customPriceCents(CUSTOM_MIN_CREDITS);
for (let c = CUSTOM_MIN_CREDITS + 1; c <= 20000; c++) {
  const price = customPriceCents(c);
  if (price !== prev + 1) { stepOk = false; break; }
  prev = price;
}
truthy(stepOk, 'each additional credit costs exactly one more cent');

let nonInteger = 0;
for (let c = CUSTOM_MIN_CREDITS; c <= CUSTOM_MAX_CREDITS; c += 997) {
  if (!Number.isInteger(customPriceCents(c))) nonInteger++;
}
eq(nonInteger, 0, 'all custom prices are integer cents');

console.log('\n--- 6. Unit economics guardrails ---\n');

// Vendor costs per unit. Update these when a real bill contradicts them.
const COST_EMAIL_VERIFY = 0.00178;  // MillionVerifier 50K tier
const COST_PHONE_LOOKUP = 0.008;    // Twilio Lookup, pessimistic, unconfirmed
const COST_EMAIL_SCORE  = 0.0035;   // Claude Haiku 4.5, estimated

const rateUsd = CREDIT_PRICE_USD_CENTS / 100;

const checks = [
  { tool: 'email verify', credits: CREDIT_COSTS.email_verify, cost: COST_EMAIL_VERIFY },
  { tool: 'phone lookup', credits: CREDIT_COSTS.phone_verify, cost: COST_PHONE_LOOKUP },
  { tool: 'email score',  credits: CREDIT_COSTS.email_score,  cost: COST_EMAIL_SCORE },
];

for (const c of checks) {
  const revenue = c.credits * rateUsd;
  const margin = (revenue - c.cost) / revenue;
  if (margin >= 0.5) {
    ok(`${c.tool} margin ${(margin * 100).toFixed(0)}% at ${PER_CREDIT_LABEL} per credit`);
  } else {
    fail(`${c.tool} margin`, `${(margin * 100).toFixed(0)}% is below the 50% floor`);
  }
}

console.log('\n--- 7. Display formatting ---\n');

eq(formatUsd(500), '5', 'formatUsd drops cents on whole dollars');
eq(formatUsd(2500), '25', 'formatUsd on Growth');
eq(formatUsd(100000), '1000', 'formatUsd on Bulk');
eq(formatUsd(26723), '267.23', 'formatUsd keeps cents when present');

console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
