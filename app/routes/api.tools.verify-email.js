/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/tools/verify-email

   Single-email synchronous verification. Follows the same shape as
   /api/tools/score-email and /api/tools/verify-number:

     1. Auth (requireUser - throws 401 redirect if not logged in)
     2. Rate limit (100/hour per user via emailVerifySingleByUser policy)
     3. Validate input (email is required, must be a string)
     4. Spend 1 credit (CREDIT_COSTS.email_verify)
     5. Run verifyOneEmail (the probe pipeline)
     6. On infrastructure failure (ok:false), refund the credit
        On any verdict (including 'unknown' from a real probe), keep the
        credit - we did the work, the answer is what it is

   Refund policy alignment:
     - syntax fail / no_mx -> verifyOneEmail returns ok:true with verdict.
       The credit was spent before the probe; we keep it. The probe DID
       run (we did the DNS lookup) and the user got a definitive verdict.
       This matches Email Scorer's behaviour.
     - infra failure (proxy down, our timeout) -> ok:false. Refund.

   Request:
     POST /api/tools/verify-email
     Content-Type: application/json
     { "email": "user@example.com", "country": "us" }   // country optional

   Response (200):
     { ok: true, result: { email, domain, category, subcategory, ... } }

   Response (400): bad input
   Response (402): insufficient credits
   Response (429): rate limited
   Response (502, ok:false, refunded:true): infrastructure failure
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser }                                     from '~/utils/session.server';
import { checkAndIncrement, rateLimitKeys, rateLimitPolicies } from '~/utils/rateLimit.server';
import { spendCredits, refundCredits }                     from '~/lib/credits.server';
import { CREDIT_COSTS }                                    from '~/utils/creditsConfig.server';
import { verifyOneEmail }                                  from '~/lib/emailVerify.server';

const COST = CREDIT_COSTS.email_verify;

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'POST required' },
      { status: 405 },
    );
  }

  // 1. Auth
  const user = await requireUser(request);

  // 2. Rate limit (100/hour per user)
  const rl = await checkAndIncrement(
    rateLimitKeys.emailVerifySingleByUser(user.id),
    rateLimitPolicies.emailVerifySingleByUser,
  );
  if (!rl.allowed) {
    return Response.json(
      {
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many verification requests. Try again in a bit.',
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

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const country = typeof body?.country === 'string' ? body.country.trim() : null;

  if (!email) {
    return Response.json(
      { ok: false, code: 'EMAIL_REQUIRED', error: 'email is required' },
      { status: 400 },
    );
  }

  // 4. Spend credit
  const spend = await spendCredits(user.id, COST, 'email_verify', { email });
  if (!spend.ok) {
    const status = spend.code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
    return Response.json(
      {
        ok: false,
        code: spend.code || 'SPEND_FAILED',
        error: spend.error || 'Could not spend credits',
        creditsNeeded: COST,
      },
      { status },
    );
  }

  // 5. Probe
  let result;
  try {
    result = await verifyOneEmail(email, country ? { country } : {});
  } catch (err) {
    // Should never happen - verifyOneEmail is contractually never-throws.
    // Belt-and-braces: refund and surface a clear error.
    await refundCredits(user.id, COST, {
      originalTransactionId: spend.transactionId,
      reason: 'email_verify_threw',
    }).catch(() => {});
    return Response.json(
      {
        ok: false,
        code: 'EMAIL_VERIFY_THREW',
        error: err && err.message ? err.message : 'Verification crashed',
        refunded: true,
      },
      { status: 500 },
    );
  }

  // 6. Refund on infrastructure failure
  if (!result.ok) {
    const refund = await refundCredits(user.id, COST, {
      originalTransactionId: spend.transactionId,
      reason: 'email_verify_failed_' + (result.code || 'unknown'),
    });
    return Response.json(
      {
        ok: false,
        code: result.code || 'EMAIL_VERIFY_FAILED',
        error: result.error || 'Verification could not complete',
        refunded: refund.ok,
        partial: result.result || null,
      },
      { status: 502 },
    );
  }

  // 7. Success - the verdict is whatever the probe returned, including
  // 'unknown' subcategory='greylist' for graylisted single-mode requests.
  // Single mode never auto-retries; the user can re-submit later.
  return Response.json({ ok: true, result: result.result });
}
