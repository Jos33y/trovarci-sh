/* /api/tools/test-smtp - SMTP Tester. Anonymous, IP rate-limited (20/hour). No credits. */

import { runSmtpTest } from '~/lib/smtpTester.server';
import { checkAndIncrement } from '~/utils/rateLimit.server';
import { recordToolEvent } from '~/utils/toolAnalytics.server';

const ANALYTICS_TOOL = 'smtp_test';

const SMTP_TEST_POLICY = { windowMinutes: 60, maxAttempts: 20 };
const RATE_LIMIT_BUCKET = (ip) => `smtp_test:ip:${ip}`;

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const ip = clientIp(request);
  const rl = await checkAndIncrement(RATE_LIMIT_BUCKET(ip), SMTP_TEST_POLICY);
  if (!rl.allowed) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'RATE_LIMITED' });
    const retrySeconds = rl.retryAfterSeconds || 60;
    return Response.json(
      {
        ok: false,
        error: `Rate limit reached. Try again in ${retrySeconds} seconds.`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: retrySeconds,
      },
      { status: 429, headers: { 'Retry-After': String(retrySeconds) } },
    );
  }

  recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'start' });

  let body;
  try {
    body = await request.json();
  } catch {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'BAD_REQUEST' });
    return Response.json(
      { ok: false, error: 'Invalid request body', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'BAD_REQUEST' });
    return Response.json(
      { ok: false, error: 'Request body must be an object', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await runSmtpTest({
    host:       body.host,
    port:       body.port,
    security:   body.security,
    username:   body.username,
    password:   body.password,
    from:       body.from,
    to:         body.to,
    timeoutSec: body.timeoutSec,
  });

  // SMTP test always returns 200 with the transcript; probe-level failures
  // are surfaced in result.summary and are not tool_error at the endpoint level.
  recordToolEvent(request, {
    tool: ANALYTICS_TOOL,
    phase: 'success',
    metadata: {
      verdict: result.summary?.verdict || null,
    },
  });

  return Response.json(
    {
      ok: true,
      steps: result.steps,
      summary: result.summary,
      rateLimit: {
        remaining: rl.remaining,
        attempts: rl.attempts,
        windowMinutes: SMTP_TEST_POLICY.windowMinutes,
      },
    },
    { status: 200 },
  );
}

export function loader() {
  return Response.json({ ok: false, error: 'Use POST' }, { status: 405 });
}
