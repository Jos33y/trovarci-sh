/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/tools/verify-email-bulk

   Start a bulk email verification job. Auth required. Credits computed
   via bulkEmailVerifyCost (1 per 5 emails, ceiling) and held against
   the job. The worker processes items asynchronously; the client polls
   /status or subscribes to /stream for progress.

   Request:
     POST /api/tools/verify-email-bulk
     Content-Type: application/json
     {
       "emails":  ["a@example.com", "b@example.com", ...]   // required, max 50000
     }

   The CSV-upload variant is intentionally out of scope here. The frontend
   parses CSV client-side and posts a JSON array. Keeps this endpoint
   single-purpose: it accepts an array of strings, nothing more.

   Validation rules:
     - emails: non-empty array of strings, max 50,000 entries
     - emails: each entry truncated to 254 chars by createBulkJob
     - the lib does NOT pre-filter for duplicates or syntax; that's the
       worker's job. We charge per row submitted, not per row processed.

   Refund:
     We hold creditsHeld = bulkEmailVerifyCost(emails.length) at job
     start. On cancel, the unused portion is refunded by the cancel
     route. On natural completion, no refund (the user got their work).

   Response (200):
     { ok: true, jobId, totalRows, creditsHeld, type: 'email' }

   Response (400): bad input
   Response (402): insufficient credits
   Response (429): rate limited

   ─── Bug fixes from prior version ───
     1. spendCredits metadata shape: previously passed { rows: N } at
        the top level; the lib expects { metadata: { rows: N } }. Audit
        metadata for every prior bulk hold has been silently empty.
     2. spend.code check: previously checked spend.code === 'INSUFFICIENT_
        CREDITS' but spendCredits returns reason: 'insufficient' (no
        `code` field). Insufficient-credit errors were returning HTTP 500
        instead of 402, so the UI showed a generic "server error" rather
        than the proper buy-credits prompt. Fixed: branch on spend.reason.
     3. Refund-on-create-failure error logging: previously swallowed all
        refund errors silently. Now logs to console for ops visibility.
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser }                                     from '~/utils/session.server';
import { checkAndIncrement, rateLimitKeys, rateLimitPolicies } from '~/utils/rateLimit.server';
import { spendCredits, refundCredits }                     from '~/lib/credits.server';
import { bulkEmailVerifyCost }                             from '~/utils/creditsConfig.server';
import { createBulkJob }                                   from '~/lib/jobQueue.server';

const MAX_BULK_SIZE = 50_000;

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'POST required' },
      { status: 405 },
    );
  }

  // 1. Auth
  const user = await requireUser(request);

  // 2. Rate limit (10 bulk-start/hour per user)
  const rl = await checkAndIncrement(
    rateLimitKeys.emailVerifyBulkStartByUser(user.id),
    rateLimitPolicies.emailVerifyBulkStartByUser,
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

  // 3. Parse + validate
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, code: 'BAD_JSON', error: 'Could not parse JSON body' },
      { status: 400 },
    );
  }

  const emails = Array.isArray(body?.emails) ? body.emails : null;
  if (!emails || emails.length === 0) {
    return Response.json(
      { ok: false, code: 'EMAILS_REQUIRED', error: 'emails must be a non-empty array' },
      { status: 400 },
    );
  }
  if (emails.length > MAX_BULK_SIZE) {
    return Response.json(
      {
        ok: false,
        code: 'BULK_TOO_LARGE',
        error: `Bulk size ${emails.length.toLocaleString()} exceeds limit of ${MAX_BULK_SIZE.toLocaleString()}`,
      },
      { status: 400 },
    );
  }
  if (!emails.every((e) => typeof e === 'string')) {
    return Response.json(
      { ok: false, code: 'EMAILS_NOT_STRINGS', error: 'every entry in emails must be a string' },
      { status: 400 },
    );
  }

  // 4. Compute cost + spend (hold).
  const cost = bulkEmailVerifyCost(emails.length);
  const spend = await spendCredits(user.id, cost, 'email_verify_bulk_hold', {
    metadata: { rows: emails.length },
  });

  // spendCredits returns:
  //   success:       { ok: true,  transactionId, newBalance }
  //   insufficient:  { ok: false, reason: 'insufficient', balance, required }
  // It does NOT return a `code` field. Earlier versions of this route
  // checked spend.code which is always undefined, sending HTTP 500 instead
  // of 402 for insufficient credits. Fixed: branch on spend.reason.
  if (!spend.ok) {
    if (spend.reason === 'insufficient') {
      return Response.json(
        {
          ok:           false,
          code:         'INSUFFICIENT_CREDITS',
          error:        `Not enough credits. This bulk job costs ${cost.toLocaleString()}, balance is ${spend.balance.toLocaleString()}.`,
          balance:      spend.balance,
          required:     cost,
          creditsNeeded: cost,
        },
        { status: 402 },
      );
    }
    // Defensive: future spendCredits failure modes (none today).
    return Response.json(
      { ok: false, code: 'SPEND_FAILED', error: 'Could not spend credits', creditsNeeded: cost },
      { status: 500 },
    );
  }

  // 5. Create job + items in one transaction.
  // Email jobs don't carry per-job country metadata (each email's domain
  // is enough for the worker). Phone jobs do - that pattern lives in
  // verify-number-bulk.js, not here.
  let job;
  try {
    job = await createBulkJob({
      userId:            user.id,
      type:              'email',
      inputs:            emails,
      creditsHeld:       cost,
      holdTransactionId: spend.transactionId,
      metadata:          { source: 'verify-email-bulk' },
    });
  } catch (err) {
    // Job creation failed AFTER spending. Refund and surface the error.
    // refundCredits resolves with { transactionId, newBalance, idempotent }
    // on success and throws on hard failure - we swallow the throw with
    // .catch() because the user's primary error is the create failure.
    // Refund failures appear in console for ops; the credit ledger has
    // the unused hold visible for manual reconciliation.
    await refundCredits(user.id, cost, {
      originalTransactionId: spend.transactionId,
      reason: 'bulk_create_failed',
    }).catch((refundErr) => {
      console.error('[verify-email-bulk] refund after create-failure also failed:', refundErr);
    });
    return Response.json(
      {
        ok: false,
        code: 'BULK_CREATE_FAILED',
        error: err && err.message ? err.message : 'Could not create job',
        refunded: true,
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok:          true,
    jobId:       job.id,
    totalRows:   job.total_rows,
    creditsHeld: cost,
    type:        'email',
  });
}
