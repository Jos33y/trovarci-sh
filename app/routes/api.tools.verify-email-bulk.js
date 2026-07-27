// POST /api/tools/verify-email-bulk - start a bulk email job, hold credits, return jobId.
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

  const user = await requireUser(request);

  // 10 bulk starts per hour per user.
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

  // Hold the full row count up front so we cannot oversell. 1 credit per address.
  const cost = bulkEmailVerifyCost(emails.length);
  const spend = await spendCredits(user.id, cost, 'email_verify_bulk_hold', {
    metadata: { rows: emails.length },
  });

  // spendCredits signals shortfall via reason:'insufficient', never a code field.
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
    // Spend already committed, so refund before surfacing. refundCredits throws on
    // hard failure; swallow it because the create failure is the user's real error.
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
