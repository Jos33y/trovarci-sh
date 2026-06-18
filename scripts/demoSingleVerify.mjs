#!/usr/bin/env node
/**
 * scripts/demoSingleVerify.mjs
 *
 * Interactive demo of the single-mode verify endpoint. Walks through
 * what /api/tools/verify-email does at the lib level so you can see
 * the flow without needing the dev server, the auth cookie, and Postman.
 *
 * Tries each input type (syntax fail, no MX, free provider, role,
 * disposable, real probe) so you see how the verifier classifies each.
 *
 * Run:
 *
 *     node --env-file=.env scripts/demoSingleVerify.mjs
 *
 * Without a proxy configured, inputs that need an SMTP probe will
 * return ok:false with PROXY_NO_CREDENTIALS - the route would refund
 * the credit in that case. Demo flags those rows so you can see which
 * inputs would refund and which would charge.
 */

import { verifyOneEmail }      from '../app/lib/emailVerify.server.js';

const TEST_INPUTS = [
  { input: 'not-an-email',          why: 'syntax fail (no probe, no proxy needed)' },
  { input: 'u@nothing-here.invalid', why: 'no MX records (no probe, no proxy needed)' },
  { input: 'admin@example.com',     why: 'role tag (probe runs if proxy configured)' },
  { input: 'test@mailinator.com',   why: 'disposable tag (probe runs if proxy configured)' },
  { input: 'someone@gmail.com',     why: 'free provider (probe runs if proxy configured)' },
];

function log(label, msg) {
  console.log(`[${label.padEnd(8)}] ${msg}`);
}

console.log('=== Single-mode verify demo ===');
console.log('');
log('config', `proxy ${process.env.PROXY_USERNAME ? 'IS' : 'NOT'} configured`);
console.log('');

let chargedCount = 0;
let refundedCount = 0;

try {
  for (const { input, why } of TEST_INPUTS) {
    console.log(`--- ${input} ---`);
    console.log(`        ${why}`);

    const start = Date.now();
    const res = await verifyOneEmail(input);
    const ms = Date.now() - start;

    if (res.ok) {
      const r = res.result;
      const tags = [
        r.isDisposable    ? 'disposable'    : null,
        r.isRole          ? 'role'          : null,
        r.isFreeProvider  ? 'free_provider' : null,
        r.isCatchall      ? 'catchall'      : null,
      ].filter(Boolean).join(',') || '-';

      log('verdict', `${r.category}/${r.subcategory || '-'}  tags=${tags}  ${ms}ms`);
      if (r.smtpResponse) log('smtp',    r.smtpResponse);

      // What the route would do: keep the credit (ok:true means we got
      // a real verdict, even if it's 'unknown' from a real probe).
      log('route',   'would charge 1 credit (verdict received)');
      chargedCount++;
    } else {
      log('verdict', `infra failure: ${res.code}`);
      if (res.error) log('error',   res.error);

      // What the route would do: refund the credit.
      log('route',   'would refund 1 credit (infrastructure failure)');
      refundedCount++;
    }
    console.log('');
  }

  console.log('--- summary ---');
  log('total',     `${TEST_INPUTS.length} inputs tested`);
  log('charged',   `${chargedCount}`);
  log('refunded',  `${refundedCount}`);
  console.log('');
  console.log('The route /api/tools/verify-email applies this exact logic:');
  console.log('  spendCredits -> verifyOneEmail -> refundCredits if ok=false');
  console.log('');

  process.exit(0);
} catch (err) {
  console.error('\nSCRIPT ERROR:', err.message);
  process.exit(1);
}
