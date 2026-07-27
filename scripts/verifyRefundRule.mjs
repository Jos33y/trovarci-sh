#!/usr/bin/env node
// Refund arithmetic for bulk jobs. Run: node --env-file=.env scripts/verifyRefundRule.mjs
// Pure arithmetic against the real cost helpers. No database, no network.

import { bulkCost, CREDIT_COSTS } from '../app/utils/creditsConfig.server.js';

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  if (actual === expected) { console.log(`  [OK]   ${label} (${actual})`); passed++; }
  else { console.log(`  [FAIL] ${label} - expected ${expected}, got ${actual}`); failed++; }
}

// Mirrors refundUnusedCreditsForJob. Kept in lockstep by hand; if the helper
// changes shape, this changes with it.
function refundForJob({ type, totalRows, errorCount, nonBillableCount }) {
  const creditsHeld = bulkCost(type, totalRows);
  const refundableRows = type === 'phone' ? errorCount : errorCount + nonBillableCount;
  if (refundableRows <= 0) return { refund: 0, kept: creditsHeld };
  const refund = Math.min(creditsHeld, bulkCost(type, refundableRows));
  return { refund, kept: creditsHeld - refund };
}

console.log('\n--- 1. Email jobs ---\n');

eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 0, nonBillableCount: 0 }).refund, 0,
   'all billable refunds nothing');
eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 0, nonBillableCount: 0 }).kept, 100,
   '  and keeps the full hold');

eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 3, nonBillableCount: 0 }).refund, 3,
   'errored rows refund');
eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 0, nonBillableCount: 20 }).refund, 20,
   'non-billable rows refund');
eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 3, nonBillableCount: 20 }).refund, 23,
   'both settle in one refund');
eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 3, nonBillableCount: 20 }).kept, 77,
   '  keeping only what a vendor charged for');

// A list of dead domains costs us nothing, so it should cost the user nothing.
eq(refundForJob({ type: 'email', totalRows: 100, errorCount: 0, nonBillableCount: 100 }).refund, 100,
   'fully non-billable job refunds everything');

// Defence in depth. Should be unreachable.
eq(refundForJob({ type: 'email', totalRows: 10, errorCount: 8, nonBillableCount: 8 }).refund, 10,
   'refund is capped at the hold');

console.log('\n--- 2. Phone jobs ---\n');

// Twilio bills every lookup, including NOT_FOUND, so only errors are refundable.
eq(refundForJob({ type: 'phone', totalRows: 100, errorCount: 0, nonBillableCount: 40 }).refund, 0,
   'non-billable is ignored for phone');
eq(refundForJob({ type: 'phone', totalRows: 100, errorCount: 5, nonBillableCount: 40 }).refund, 10,
   'errored lookups refund at 2 credits each');

console.log('\n--- 3. Realistic list ---\n');

// A 10,000 row list: 6% syntax or dead domains resolved locally, 14% catch-all or
// unknown that the provider does not charge for, 0.5% infrastructure errors.
const job = { type: 'email', totalRows: 10_000, errorCount: 50, nonBillableCount: 2_000 };
const { refund, kept } = refundForJob(job);
eq(refund, 2_050, '10,000 row list refunds');
eq(kept, 7_950, '  charging for the rest');
console.log(`         effective price: $${(kept / 100 / 10_000).toFixed(4)} per address at $0.010 per credit`);
console.log(`         discount: ${((refund / 10_000) * 100).toFixed(1)}% off list, funded entirely by unspent vendor cost`);

console.log('\n--- 4. Cancel path ---\n');

// cancelJob keeps bulkCost(type, billableRows). Non-billable done rows are not kept.
function cancelKeep({ type, totalRows, doneRows, nonBillableDone }) {
  const creditsHeld = bulkCost(type, totalRows);
  const billableRows = doneRows - nonBillableDone;
  const kept = bulkCost(type, billableRows);
  return { refund: Math.max(0, creditsHeld - kept), kept };
}

eq(cancelKeep({ type: 'email', totalRows: 1_000, doneRows: 300, nonBillableDone: 0 }).refund, 700,
   'cancel at 300 of 1,000 refunds the untouched rows');
eq(cancelKeep({ type: 'email', totalRows: 1_000, doneRows: 300, nonBillableDone: 60 }).refund, 760,
   '  plus the non-billable ones already processed');
eq(cancelKeep({ type: 'email', totalRows: 1_000, doneRows: 0, nonBillableDone: 0 }).refund, 1_000,
   'cancel before any work refunds in full');

console.log('\n--- 5. Cost helper sanity ---\n');

eq(CREDIT_COSTS.email_verify, 1, 'email verify is 1 credit');
eq(bulkCost('email', 250), 250, 'bulkCost email is linear');
eq(bulkCost('phone', 250), 500, 'bulkCost phone is 2 per number');

console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
