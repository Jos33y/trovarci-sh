// POST /api/tools/verify-email - single email verification with credit refund on infra failure.

import { requireUser }                                        from '~/utils/session.server';
import { checkAndIncrement, rateLimitKeys, rateLimitPolicies } from '~/utils/rateLimit.server';
import { spendCredits, refundCredits }                        from '~/lib/credits.server';
import { CREDIT_COSTS }                                       from '~/utils/creditsConfig.server';
import { verifyOneEmail }                                     from '~/lib/emailVerify.server';

const COST = CREDIT_COSTS.email_verify;

// Never-throws wrapper around refundCredits. Logs hard failures, returns ok flag.
async function safeRefund(userId, amount, opts) {
  try {
    const r = await refundCredits(userId, amount, opts);
    return { ok: true, transactionId: r?.transactionId || null };
  } catch (err) {
    console.error('[verify-email] refund failed:', opts?.reason, err?.message || err);
    return { ok: false };
  }
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  // Top-level catch so we never return an empty-body 5xx (Cloudflare wraps those).
  try {
    const user = await requireUser(request);

    const rl = await checkAndIncrement(
      rateLimitKeys.emailVerifySingleByUser(user.id),
      rateLimitPolicies.emailVerifySingleByUser,
    );
    if (!rl.allowed) {
      return Response.json(
        { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: rl.retryAfterSeconds },
        { status: 429, headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : undefined },
      );
    }

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 }); }

    const email   = typeof body?.email   === 'string' ? body.email.trim()   : '';
    const country = typeof body?.country === 'string' ? body.country.trim() : null;

    if (!email) {
      return Response.json({ ok: false, code: 'EMAIL_REQUIRED', error: 'email is required' }, { status: 400 });
    }

    // Spend credit up front so we cannot oversell. Wrap because spendCredits can throw on DB errors.
    let spend;
    try {
      spend = await spendCredits(user.id, COST, 'email_verify', { metadata: { email } });
    } catch (err) {
      console.error('[verify-email] spend threw:', err?.message || err);
      return Response.json({ ok: false, code: 'SPEND_THREW', error: 'Could not spend credits' }, { status: 500 });
    }

    if (!spend.ok) {
      // spendCredits failure shape: { ok:false, reason:'insufficient', balance }
      const insufficient = spend.reason === 'insufficient';
      return Response.json(
        {
          ok:            false,
          code:          insufficient ? 'INSUFFICIENT_CREDITS' : 'SPEND_FAILED',
          error:         insufficient ? 'Not enough credits' : (spend.error || 'Could not spend credits'),
          creditsNeeded: COST,
          balance:       spend.balance ?? null,
        },
        { status: insufficient ? 402 : 500 },
      );
    }

    // verifyOneEmail is contractually never-throws but wrap belt-and-braces.
    let result;
    try {
      result = await verifyOneEmail(email, country ? { country } : {});
    } catch (err) {
      console.error('[verify-email] verifyOneEmail threw:', err?.message || err);
      const refund = await safeRefund(user.id, COST, {
        originalTransactionId: spend.transactionId,
        reason: 'email_verify_threw',
      });
      return Response.json(
        { ok: false, code: 'EMAIL_VERIFY_THREW', error: err?.message || 'Verification crashed', refunded: refund.ok },
        { status: 500 },
      );
    }

    // Infrastructure failure - refund. Verdict (any category) - keep the credit.
    if (!result.ok) {
      const refund = await safeRefund(user.id, COST, {
        originalTransactionId: spend.transactionId,
        reason: 'email_verify_failed_' + (result.code || 'unknown'),
      });
      return Response.json(
        {
          ok:       false,
          code:     result.code || 'EMAIL_VERIFY_FAILED',
          error:    result.error || 'Verification could not complete',
          refunded: refund.ok,
          partial:  result.result || null,
        },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, result: result.result });

  } catch (err) {
    console.error('[verify-email] uncaught:', err?.message || err, err?.stack ? '\n' + err.stack : '');
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
