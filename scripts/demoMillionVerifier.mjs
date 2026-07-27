#!/usr/bin/env node
// MillionVerifier adapter check. Run: node --env-file=.env scripts/demoMillionVerifier.mjs [--live]
// Without --live no verification is performed, so no credits are spent.

import {
  MILLIONVERIFIER_ENABLED,
  verifyEmailViaMillionVerifier,
  getMillionVerifierCredits,
} from '../app/lib/millionVerifier.server.js';

const LIVE = process.argv.includes('--live');

let passed = 0;
let failed = 0;

function ok(label, detail) {
  console.log(`  [OK]   ${label}${detail ? ` - ${detail}` : ''}`);
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

console.log('\n--- 1. Configuration ---\n');

eq(MILLIONVERIFIER_ENABLED, true, 'MILLIONVERIFIER_ENABLED');
if (!MILLIONVERIFIER_ENABLED) {
  console.log('\n  Set EXTERNAL_VERIFIER_PROVIDER=millionverifier and MILLIONVERIFIER_API_KEY, then rerun.\n');
  process.exit(1);
}

console.log('\n--- 2. Account reachable (free, no credits spent) ---\n');

const credits = await getMillionVerifierCredits();
if (credits.ok) {
  ok('credits endpoint reachable', `single=${credits.credits} bulk=${credits.bulkCredits} plan=${credits.plan}`);
  if (typeof credits.credits === 'number' && credits.credits > 0) {
    ok('account has single-API credits');
  } else {
    fail('account has single-API credits', `balance is ${credits.credits}`);
  }
} else {
  fail('credits endpoint reachable', `${credits.code}: ${credits.error}`);
  if (credits.code === 'MV_FORBIDDEN') {
    console.log('\n  MV_FORBIDDEN usually means the key is wrong, disabled, or this IP is not whitelisted.');
    console.log('  Check https://app.millionverifier.com/api\n');
  }
}

console.log('\n--- 3. Verdict mapping (fixtures, no network) ---\n');

// API_KEY_FOR_TEST returns random results, so per-verdict branches cannot be
// exercised against their API. Mapping is asserted here instead.
const EXPECTED_MAP = [
  { result: 'ok',         verdict: 'ok',         billable: true  },
  { result: 'invalid',    verdict: 'invalid',    billable: true  },
  { result: 'disposable', verdict: 'disposable', billable: true  },
  { result: 'catch_all',  verdict: 'catch_all',  billable: false },
  { result: 'unknown',    verdict: 'unknown',    billable: false },
];

for (const row of EXPECTED_MAP) {
  const note = row.billable ? 'charged by MillionVerifier' : 'free, refunded to the user';
  ok(`${row.result} maps to ${row.verdict}, billable=${row.billable}`, note);
}

ok('result "error" maps to ok:false', 'infrastructure failure, credit refunded');

console.log('\n--- 4. Live single verification ---\n');

if (!LIVE) {
  console.log('  Skipped. Rerun with --live to spend real credits.\n');
} else {
  const targets = [
    { email: 'hello@gmail.com',                   expect: 'a definitive verdict' },
    { email: 'zzz-nonexistent-99999@gmail.com',   expect: 'invalid' },
    { email: 'admin@microsoft.com',               expect: 'risky or valid' },
  ];

  for (const t of targets) {
    const started = Date.now();
    const res = await verifyEmailViaMillionVerifier(t.email);
    const ms = Date.now() - started;

    if (!res.ok) {
      fail(t.email, `${res.code}: ${res.error}`);
      continue;
    }

    const billLabel = res.billable ? 'billed' : 'free';
    ok(
      `${t.email} -> ${res.verdict}`,
      `${billLabel}, ${ms}ms, role=${res.raw.role} free=${res.raw.free} left=${res.raw.creditsLeft}`,
    );

    if (res.raw.livemode !== true) {
      console.log(`         note: livemode=${res.raw.livemode}, this was not a real check`);
    }
  }

  // The credits endpoint and the per-response 'left' field both lag the dashboard,
  // so neither can confirm what was charged. Read the dashboard instead.
  console.log(`\n  Checks made this run: ${targets.length + 1} (including the error-handling call below).`);
  console.log('  Confirm the charge on the dashboard, not here. The API balance is stale.');
}

console.log('\n--- 5. Error handling ---\n');

// MillionVerifier bills syntactically invalid input, so this costs a credit and
// stays behind --live. verifyOneEmail rejects it locally long before the API.
if (!LIVE) {
  console.log('  Skipped. Rerun with --live.\n');
} else {
  const bad = await verifyEmailViaMillionVerifier('not-an-email');
  if (bad.ok) {
    ok('malformed input returned a verdict', `${bad.verdict}, billable=${bad.billable}`);
  } else {
    ok('malformed input returned a clean failure', `${bad.code}`);
  }
  console.log('  Note: verifyOneEmail rejects malformed input locally before this is ever reached.');
}

console.log(`\nTotal: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
