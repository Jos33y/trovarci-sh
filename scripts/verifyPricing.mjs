#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/verifyPricing.mjs

   Validates the pricing model after the flat-rate / bulk-1cr-per-5
   migration. Tests:

     1. CREDIT_COSTS contains email_verify_bulk_per_5 (and NOT _per_100)
     2. bulkEmailVerifyCost rounds correctly at 1, 5, 6, 50, 50000
     3. CREDIT_PACKAGES are flat $0.010/credit across all 3 presets
     4. CUSTOM_PRICE_PER_CREDIT is 0.010
     5. buildCustomPackage works at min, max, and a sample mid value

   Run:  node --env-file=.env scripts/verifyPricing.mjs

   Pattern matches verifyBatch01-05.mjs: [OK]/[FAIL] prefixes,
   section banners, summary, exit code 0|1.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  CREDIT_COSTS,
  bulkEmailVerifyCost,
  WELCOME_BONUS_AMOUNT,
} from '../app/utils/creditsConfig.server.js';

import {
  CREDIT_PACKAGES,
  CUSTOM_PRICE_PER_CREDIT,
  CUSTOM_MIN_CREDITS,
  CUSTOM_MAX_CREDITS,
  buildCustomPackage,
  getPackage,
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

// =========================================================================

console.log('\n--- 1. CREDIT_COSTS shape ---\n');

eq(CREDIT_COSTS.email_verify, 1, 'email_verify single cost');
eq(CREDIT_COSTS.email_verify_bulk_per_5, 1, 'email_verify_bulk_per_5 cost');
eq(CREDIT_COSTS.phone_verify, 2, 'phone_verify cost');
eq(CREDIT_COSTS.email_score, 1, 'email_score cost');

if ('email_verify_bulk_per_100' in CREDIT_COSTS) {
  fail('legacy email_verify_bulk_per_100 key', 'key must be removed - rename to _per_5');
} else {
  ok('legacy email_verify_bulk_per_100 key removed');
}

eq(CREDIT_COSTS.domain_check, 0, 'domain_check is free');
eq(CREDIT_COSTS.smtp_test, 0, 'smtp_test is free');
eq(CREDIT_COSTS.dns_generate, 0, 'dns_generate is free');

eq(WELCOME_BONUS_AMOUNT, 10, 'welcome bonus is 10 credits');

// =========================================================================

console.log('\n--- 2. bulkEmailVerifyCost math ---\n');

eq(bulkEmailVerifyCost(0), 0, 'bulkEmailVerifyCost(0)');
eq(bulkEmailVerifyCost(1), 1, 'bulkEmailVerifyCost(1)  -> 1 credit (rounds up)');
eq(bulkEmailVerifyCost(5), 1, 'bulkEmailVerifyCost(5)  -> 1 credit (boundary)');
eq(bulkEmailVerifyCost(6), 2, 'bulkEmailVerifyCost(6)  -> 2 credits (rolls over)');
eq(bulkEmailVerifyCost(10), 2, 'bulkEmailVerifyCost(10) -> 2 credits');
eq(bulkEmailVerifyCost(50), 10, 'bulkEmailVerifyCost(50)');
eq(bulkEmailVerifyCost(100), 20, 'bulkEmailVerifyCost(100)');
eq(bulkEmailVerifyCost(500), 100, 'bulkEmailVerifyCost(500) - matches Starter preset');
eq(bulkEmailVerifyCost(2500), 500, 'bulkEmailVerifyCost(2500)');
eq(bulkEmailVerifyCost(50000), 10000, 'bulkEmailVerifyCost(50000) - matches Pro preset');

// Edge cases - input sanity
eq(bulkEmailVerifyCost(-5), 0, 'bulkEmailVerifyCost(-5) returns 0');
eq(bulkEmailVerifyCost(2.5), 0, 'bulkEmailVerifyCost(2.5) returns 0 (non-integer)');
eq(bulkEmailVerifyCost('abc'), 0, 'bulkEmailVerifyCost("abc") returns 0');

// =========================================================================

console.log('\n--- 3. Preset packages all flat $0.010/credit ---\n');

eq(CREDIT_PACKAGES.length, 3, 'three preset packages');

const expected = [
  { key: 'starter', credits: 500,   priceUsdCents: 500 },
  { key: 'growth',  credits: 2500,  priceUsdCents: 2500 },
  { key: 'pro',     credits: 10000, priceUsdCents: 10000 },
];

for (const want of expected) {
  const pkg = getPackage(want.key);
  if (!pkg) {
    fail(`getPackage('${want.key}')`, 'package missing');
    continue;
  }
  eq(pkg.credits, want.credits, `${want.key} credits`);
  eq(pkg.priceUsdCents, want.priceUsdCents, `${want.key} priceUsdCents`);
  eq(pkg.pricePerCredit, 0.010, `${want.key} pricePerCredit`);

  // Ratio check: priceUsdCents / credits === 1.0 (cents per credit at $0.010)
  const ratio = pkg.priceUsdCents / pkg.credits;
  if (Math.abs(ratio - 1.0) < 0.0001) {
    ok(`${want.key} ratio: 1 cent per credit ($0.010)`);
  } else {
    fail(`${want.key} ratio`, `expected 1.0 cent/credit, got ${ratio}`);
  }
}

const popular = CREDIT_PACKAGES.find(p => p.popular);
truthy(popular?.key === 'growth', 'growth marked as popular');

// =========================================================================

console.log('\n--- 4. Custom amount config ---\n');

eq(CUSTOM_PRICE_PER_CREDIT, 0.010, 'CUSTOM_PRICE_PER_CREDIT');
eq(CUSTOM_MIN_CREDITS, 100, 'CUSTOM_MIN_CREDITS');
eq(CUSTOM_MAX_CREDITS, 50000, 'CUSTOM_MAX_CREDITS');

// =========================================================================

console.log('\n--- 5. buildCustomPackage ---\n');

const cMin = buildCustomPackage(100);
truthy(cMin, 'buildCustomPackage(100) returns a package');
if (cMin) {
  eq(cMin.credits, 100, '  credits');
  eq(cMin.priceUsdCents, 100, '  priceUsdCents (100 cents = $1.00)');
  eq(cMin.pricePerCredit, 0.010, '  pricePerCredit');
}

const cMid = buildCustomPackage(1000);
truthy(cMid, 'buildCustomPackage(1000) returns a package');
if (cMid) {
  eq(cMid.priceUsdCents, 1000, '  priceUsdCents (1000 cents = $10.00)');
}

const cMax = buildCustomPackage(50000);
truthy(cMax, 'buildCustomPackage(50000) returns a package');
if (cMax) {
  eq(cMax.priceUsdCents, 50000, '  priceUsdCents (50000 cents = $500.00)');
}

eq(buildCustomPackage(99), null,    'buildCustomPackage(99) below min returns null');
eq(buildCustomPackage(50001), null, 'buildCustomPackage(50001) above max returns null');
eq(buildCustomPackage(2.5), null,   'buildCustomPackage(2.5) non-integer returns null');
eq(buildCustomPackage('abc'), null, 'buildCustomPackage("abc") returns null');

// =========================================================================

console.log('\n--- 6. Cross-check: bulk cost matches preset price ---\n');

// The whole point of the flat rate: a Pro preset should equal 50,000-email
// bulk job cost. Both 10,000 credits = $100.
const pro = getPackage('pro');
const bulkProCredits = bulkEmailVerifyCost(50000);
eq(bulkProCredits, pro.credits, 'Pro preset credits == bulkEmailVerifyCost(50000)');
const bulkProDollars = (bulkProCredits * CUSTOM_PRICE_PER_CREDIT).toFixed(2);
const proDollars = (pro.priceUsdCents / 100).toFixed(2);
eq(bulkProDollars, proDollars, '  same dollar cost: $' + proDollars);

// =========================================================================

console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
