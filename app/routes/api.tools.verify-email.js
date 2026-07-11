// POST /api/tools/verify-email - single email verification with credit refund on infra failure.

import { requireUser }                                        from '~/utils/session.server';
import { checkAndIncrement, rateLimitKeys, rateLimitPolicies } from '~/utils/rateLimit.server';
import { spendCredits, refundCredits }                        from '~/lib/credits.server';
import { CREDIT_COSTS }                                       from '~/utils/creditsConfig.server';
import { verifyOneEmail }                                     from '~/lib/emailVerify.server';
import { recordToolEvent }                                    from '~/utils/toolAnalytics.server';

const COST = CREDIT_COSTS.email_verify;
const ANALYTICS_TOOL = 'email_verify';

// Never-throws wrapper around refundCredits.
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

  try {
    const user = await requireUser(request);

    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'start', userId: user.id });

    const rl = await checkAndIncrement(
      rateLimitKeys.emailVerifySingleByUser(user.id),
      rateLimitPolicies.emailVerifySingleByUser,
    );
    if (!rl.allowed) {
      recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'RATE_LIMITED', userId: user.id });
      return Response.json(
        { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: rl.retryAfterSeconds },
        { status: 429, headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : undefined },
      );
    }

    let body;
    try { body = await request.json(); }
    catch {
      recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'BAD_JSON', userId: user.id });
      return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 });
    }

    const email   = typeof body?.email   === 'string' ? body.email.trim()   : '';
    const country = typeof body?.country === 'string' ? body.country.trim() : null;

    if (!email) {
      recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'EMAIL_REQUIRED', userId: user.id });
      return Response.json({ ok: false, code: 'EMAIL_REQUIRED', error: 'email is required' }, { status: 400 });
    }

    let spend;
    try {
      spend = await spendCredits(user.id, COST, 'email_verify', { metadata: { email } });
    } catch (err) {
      console.error('[verify-email] spend threw:', err?.message || err);
      recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'SPEND_THREW', userId: user.id });
      return Response.json({ ok: false, code: 'SPEND_THREW', error: 'Could not spend credits' }, { status: 500 });
    }

    if (!spend.ok) {
      const insufficient = spend.reason === 'insufficient';
      recordToolEvent(request, {
        tool: ANALYTICS_TOOL,
        phase: 'error',
        code: insufficient ? 'INSUFFICIENT_CREDITS' : 'SPEND_FAILED',
        userId: user.id,
        metadata: { balance: spend.balance ?? null, required: COST },
      });
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

    let result;
    try {
      result = await verifyOneEmail(email, country ? { country } : {});
    } catch (err) {
      console.error('[verify-email] verifyOneEmail threw:', err?.message || err);
      const refund = await safeRefund(user.id, COST, {
        originalTransactionId: spend.transactionId,
        reason: 'email_verify_threw',
      });
      recordToolEvent(request, {
        tool: ANALYTICS_TOOL,
        phase: 'error',
        code: 'EMAIL_VERIFY_THREW',
        userId: user.id,
        metadata: { refunded: refund.ok },
      });
      return Response.json(
        { ok: false, code: 'EMAIL_VERIFY_THREW', error: err?.message || 'Verification crashed', refunded: refund.ok },
        { status: 500 },
      );
    }

    if (!result.ok) {
      const refund = await safeRefund(user.id, COST, {
        originalTransactionId: spend.transactionId,
        reason: 'email_verify_failed_' + (result.code || 'unknown'),
      });
      recordToolEvent(request, {
        tool: ANALYTICS_TOOL,
        phase: 'error',
        code: result.code || 'EMAIL_VERIFY_FAILED',
        userId: user.id,
        metadata: { refunded: refund.ok },
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

    recordToolEvent(request, {
      tool: ANALYTICS_TOOL,
      phase: 'success',
      userId: user.id,
      metadata: { spent: COST },
    });

    return Response.json({ ok: true, result: result.result });

  } catch (err) {
    // Auth failure: requireUser throws a Response object. Return it as-is
    // instead of miscategorising as INTERNAL. Fire tool_error AUTH_REQUIRED
    // for clean signup-opportunity metrics.
    if (err instanceof Response) {
      recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'AUTH_REQUIRED' });
      return err;
    }
    console.error('[verify-email] uncaught:', err?.message || err, err?.stack ? '\n' + err.stack : '');
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'INTERNAL' });
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
