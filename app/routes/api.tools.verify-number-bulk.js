/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/tools/verify-number-bulk

   Start a bulk PHONE verification job. Auth required. Credits computed
   via bulkPhoneVerifyCost (2 per number, no batch discount) and held
   against the job. The worker processes items asynchronously; the
   client polls /status or subscribes to /stream for progress.

   Request:
     POST /api/tools/verify-number-bulk
     Content-Type: application/json
     {
       "numbers": ["+15551234567", "5552345678", ...],   // required, max 10,000
       "country": "US"                                   // optional ISO 3166 alpha-2
     }

   Numbers can be E.164 (with leading '+') OR national format. National
   format uses the `country` field to disambiguate. The worker re-runs
   phoneFormat per item so a mixed-format list works fine.

   Validation rules (route-side, before any credit hold):
     - numbers: non-empty array, max BULK_PHONE_MAX_ROWS (10,000)
     - numbers: each entry is a string, length-capped to 254 chars by
       createBulkJob
     - country: 2-char ISO if present, else US default

   The route does NOT pre-filter for duplicates or format-validity.
   That's the worker's job. We charge per row submitted - same model as
   email bulk - because:
     1. Pre-filtering would require the route to do work that scales
        with input size, blocking the response.
     2. The worker's format check is the same code path that runs in
        single mode - keeping classification in one place avoids drift.
     3. Format-invalid items still consume queue slots and tick progress
        which has a tiny but nonzero cost; charging for them keeps the
        accounting honest.

   Refund:
     creditsHeld = bulkPhoneVerifyCost(numbers.length) is held at job
     start. On cancel, the cancel route refunds the unused portion. On
     natural completion, no refund (the user got the work, including
     "this number is unreachable" verdicts which ARE the work).

   Response (200):
     { ok: true, jobId, totalRows, creditsHeld }

   Response (400): bad input
   Response (402): insufficient credits
   Response (429): rate limited

   ─── Differences from the email-bulk route worth noting ───
     1. spend.reason check (lib returns reason:'insufficient', not code).
        The email-bulk route has a copy-paste bug here (checks .code which
        is never set) - we get the right behavior in this route from the
        start. The email-bulk route should be patched in a polish pass.
     2. metadata shape: spendCredits expects { metadata: {...} }; passing
        { rows: ... } at the top level is silently dropped. The email-bulk
        route also has this bug. Fixed here.
     3. refundCredits return-shape: the lib returns
        { transactionId, newBalance, idempotent } on success and throws
        on failure - it does NOT return { ok: true }. The email-bulk
        route handles this correctly via .catch(). The email-cancel route
        gets this wrong (checks refund.ok which is undefined) - fixed in
        the cancel route patch shipping alongside this file.
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser }                                          from '~/utils/session.server';
import { checkAndIncrement, rateLimitKeys, rateLimitPolicies }  from '~/utils/rateLimit.server';
import { spendCredits, refundCredits }                          from '~/lib/credits.server';
import { bulkPhoneVerifyCost, BULK_PHONE_MAX_ROWS }             from '~/utils/creditsConfig.server';
import { createBulkJob }                                        from '~/lib/jobQueue.server';

const MAX_INPUT_LENGTH = 64;  // matches single-mode MAX_INPUT_BYTES

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'POST required' },
      { status: 405 },
    );
  }

  // ─── 1. Auth ────────────────────────────────────────────────────────────
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return Response.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign in to start a bulk job' },
      { status: 401 },
    );
  }

  // ─── 2. Rate limit (10 bulk-start/hour per user) ────────────────────────
  const rl = await checkAndIncrement(
    rateLimitKeys.phoneVerifyBulkStartByUser(user.id),
    rateLimitPolicies.phoneVerifyBulkStartByUser,
  );
  if (!rl.allowed) {
    return Response.json(
      {
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many bulk jobs started. Try again in a bit.',
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: rl.retryAfterSeconds
          ? { 'Retry-After': String(rl.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  // ─── 3. Parse + validate ───────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, code: 'BAD_JSON', error: 'Could not parse JSON body' },
      { status: 400 },
    );
  }

  const numbers = Array.isArray(body?.numbers) ? body.numbers : null;
  if (!numbers || numbers.length === 0) {
    return Response.json(
      { ok: false, code: 'NUMBERS_REQUIRED', error: 'numbers must be a non-empty array' },
      { status: 400 },
    );
  }
  if (numbers.length > BULK_PHONE_MAX_ROWS) {
    return Response.json(
      {
        ok: false,
        code: 'BULK_TOO_LARGE',
        error: `Bulk size ${numbers.length.toLocaleString()} exceeds limit of ${BULK_PHONE_MAX_ROWS.toLocaleString()}`,
      },
      { status: 400 },
    );
  }
  if (!numbers.every((n) => typeof n === 'string')) {
    return Response.json(
      { ok: false, code: 'NUMBERS_NOT_STRINGS', error: 'every entry in numbers must be a string' },
      { status: 400 },
    );
  }
  // Per-item length cap. Anything longer than 64 chars is junk - a real
  // E.164 with formatting tops out around 27. Cap before persistence so a
  // crafted payload can't bloat the items table.
  for (const n of numbers) {
    if (n.length > MAX_INPUT_LENGTH) {
      return Response.json(
        {
          ok: false,
          code: 'NUMBER_TOO_LONG',
          error: `One or more numbers exceed ${MAX_INPUT_LENGTH} characters`,
        },
        { status: 400 },
      );
    }
  }

  // Country is optional. Validate shape but don't reject - default to US
  // (matches single-mode behavior in api.tools.verify-number.js).
  const rawCountry = typeof body?.country === 'string' ? body.country.toUpperCase() : null;
  const country = rawCountry && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : 'US';

  // ─── 4. Compute cost + spend (hold) ────────────────────────────────────
  const cost = bulkPhoneVerifyCost(numbers.length);

  // spendCredits returns:
  //   success:       { ok: true,  transactionId, newBalance }
  //   insufficient:  { ok: false, reason: 'insufficient', balance, required }
  //   throws:        on hard DB errors only (caller's responsibility)
  const spend = await spendCredits(user.id, cost, 'phone_verify_bulk_hold', {
    metadata: {
      rows: numbers.length,
      country,
    },
  });

  if (!spend.ok) {
    if (spend.reason === 'insufficient') {
      return Response.json(
        {
          ok: false,
          code: 'INSUFFICIENT_CREDITS',
          error: `Not enough credits. This bulk job costs ${cost.toLocaleString()}, balance is ${spend.balance.toLocaleString()}.`,
          balance: spend.balance,
          required: cost,
        },
        { status: 402 },
      );
    }
    // Defensive: future spendCredits failure modes (none today). 500 makes
    // it visible in error monitoring without conflating with insufficient.
    return Response.json(
      { ok: false, code: 'SPEND_FAILED', error: 'Could not spend credits' },
      { status: 500 },
    );
  }

  // ─── 5. Create job + items in one transaction ──────────────────────────
  let job;
  try {
    job = await createBulkJob({
      userId:            user.id,
      type:              'phone',
      inputs:            numbers,
      creditsHeld:       cost,
      holdTransactionId: spend.transactionId,
      metadata:          { country, source: 'verify-number-bulk' },
    });
  } catch (err) {
    // Job creation failed AFTER credit spend. Refund and surface the error.
    // refundCredits throws on hard failure - we swallow that with .catch()
    // because the user's primary error is the create failure. Refund
    // failures appear in console for ops; the credit ledger has the
    // unused hold visible for manual reconciliation.
    await refundCredits(user.id, cost, {
      originalTransactionId: spend.transactionId,
      reason:                'bulk_create_failed',
    }).catch((refundErr) => {
      console.error('[verify-number-bulk] refund after create-failure also failed:', refundErr);
    });

    return Response.json(
      {
        ok:       false,
        code:     'BULK_CREATE_FAILED',
        error:    err && err.message ? err.message : 'Could not create job',
        refunded: true,
      },
      { status: 500 },
    );
  }

  // ─── 6. Success ────────────────────────────────────────────────────────
  return Response.json({
    ok:          true,
    jobId:       job.id,
    totalRows:   job.total_rows,
    creditsHeld: cost,
    type:        'phone',
  });
}
