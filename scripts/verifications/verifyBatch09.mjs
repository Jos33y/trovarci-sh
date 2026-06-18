#!/usr/bin/env node
/**
 * verifyBatch09.mjs - P1-20 Stripe scaffold smoke test
 *
 * Pure-Node checks (no DB writes, no Stripe API calls):
 *   1. Signature primitives produce + verify a valid sig
 *   2. paymentsConfig exports STRIPE_API_BASE, STRIPE_WEBHOOK_TOLERANCE_SEC
 *   3. STRIPE_ENABLED flag honours env var
 *   4. When STRIPE_ENABLED=true, getStripeCredentials() loads keys
 *
 * Live Stripe round-trip is opt-in via STRIPE_VERIFY_LIVE=1 (set by you when
 * you have test keys). Default run does not hit Stripe.
 *
 * Usage:
 *   node --env-file=.env scripts/verifyBatch09.mjs
 *   STRIPE_VERIFY_LIVE=1 node --env-file=.env scripts/verifyBatch09.mjs
 */

import {
  computeStripeSignature,
  verifyStripeWebhookSignature,
} from '../app/lib/stripeSignature.server.js';

let pass = 0;
let fail = 0;

function ok(label) {
  console.log(`  PASS  ${label}`);
  pass++;
}
function bad(label, detail) {
  console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
  fail++;
}

console.log('\n=== P1-20 Stripe scaffold smoke ===\n');

// 1. Signature roundtrip
{
  const secret = 'whsec_smoke_test_secret_xxxxxxxxxxxxxxxxxxxx';
  const t = Math.floor(Date.now() / 1000);
  const body = '{"id":"evt_smoke","type":"checkout.session.completed"}';
  const sig = computeStripeSignature(t, body, secret);
  const header = `t=${t},v1=${sig}`;
  if (verifyStripeWebhookSignature(body, header, secret)) {
    ok('signature roundtrip');
  } else {
    bad('signature roundtrip');
  }

  if (!verifyStripeWebhookSignature(body + 'x', header, secret)) {
    ok('signature rejects tampered body');
  } else {
    bad('signature rejects tampered body');
  }
}

// 2. Config exports
{
  const cfg = await import('../app/utils/paymentsConfig.server.js');
  if (typeof cfg.STRIPE_API_BASE === 'string' && cfg.STRIPE_API_BASE.startsWith('https://')) {
    ok(`STRIPE_API_BASE = ${cfg.STRIPE_API_BASE}`);
  } else {
    bad('STRIPE_API_BASE missing or invalid');
  }

  if (Number.isFinite(cfg.STRIPE_WEBHOOK_TOLERANCE_SEC) && cfg.STRIPE_WEBHOOK_TOLERANCE_SEC > 0) {
    ok(`STRIPE_WEBHOOK_TOLERANCE_SEC = ${cfg.STRIPE_WEBHOOK_TOLERANCE_SEC}`);
  } else {
    bad('STRIPE_WEBHOOK_TOLERANCE_SEC invalid');
  }

  // 3. Flag wiring
  console.log(`        STRIPE_ENABLED env = ${process.env.STRIPE_ENABLED || '(unset)'}`);
  console.log(`        STRIPE_ENABLED resolved = ${cfg.STRIPE_ENABLED}`);

  // 4. Credentials loader behaves
  if (cfg.STRIPE_ENABLED) {
    try {
      const creds = cfg.getStripeCredentials();
      if (creds.secretKey && creds.webhookSecret) {
        ok('getStripeCredentials() loaded both keys');
        if (!creds.secretKey.startsWith('sk_')) {
          bad('STRIPE_SECRET_KEY does not start with sk_ (test or live)');
        }
        if (!creds.webhookSecret.startsWith('whsec_')) {
          bad('STRIPE_WEBHOOK_SECRET does not start with whsec_');
        }
      } else {
        bad('getStripeCredentials() returned empty values');
      }
    } catch (err) {
      bad('getStripeCredentials() threw', err.message);
    }
  } else {
    console.log('        Stripe disabled - skipping credentials check');
  }
}

// 5. Optional live round-trip
if (process.env.STRIPE_VERIFY_LIVE === '1') {
  console.log('\n  Live round-trip (STRIPE_VERIFY_LIVE=1):');
  try {
    const { createCheckoutSession } = await import('../app/lib/stripe.server.js');
    const fakePaymentId = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
    const session = await createCheckoutSession({
      paymentId: fakePaymentId,
      amountUsdCents: 500,
      credits: 500,
      packageKey: 'starter',
      packageName: 'Smoke Test',
    });
    if (session.id?.startsWith('cs_test_')) {
      ok(`live round-trip created test session ${session.id}`);
    } else if (session.id?.startsWith('cs_live_')) {
      bad('live round-trip used a LIVE key - aborting smoke', session.id);
    } else {
      bad('live round-trip returned unexpected session id', session.id);
    }
  } catch (err) {
    bad('live round-trip threw', err.message);
  }
} else {
  console.log('\n  (set STRIPE_VERIFY_LIVE=1 with test keys to add a live round-trip)');
}

console.log('');
if (fail > 0) {
  console.error(`FAIL: ${pass} passed, ${fail} failed\n`);
  process.exit(1);
}
console.log(`PASS: ${pass} checks\n`);
process.exit(0);
