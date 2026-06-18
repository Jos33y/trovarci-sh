/* ═══════════════════════════════════════════════════════════════════════════
   /api/tools/test-smtp

   Orchestrates the SMTP Tester endpoint. Anonymous-accessible, no credits.
   Rate-limited by IP via the shared Postgres-backed limiter.

   Security posture:
     - Credentials never appear in logs, Sentry, or the response body. Only
       the redacted transcript lines from smtpTester.server.js are returned.
     - Request body is parsed ONCE; the password string is held in a local
       variable that goes out of scope when the function returns.
     - SSRF guard runs inside the probe before any outbound socket opens.
     - Strict IP rate limit: 20 tests per hour per IP. Abuse vectors this
       stops: credential stuffing via our infra, SMTP scanning at scale.
     - Hard 30s overall timeout enforced in the probe, not just the route.

   This route deliberately does NOT log successful test requests; even metadata
   about "this IP tested smtp.gmail.com" has a privacy-cost vs zero operational
   value. Failures are not logged either for the same reason.
   ═══════════════════════════════════════════════════════════════════════════ */

import { runSmtpTest } from '~/lib/smtpTester.server';
import { checkAndIncrement } from '~/utils/rateLimit.server';

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

  /* 1. Rate limit by IP before any work. */
  const ip = clientIp(request);
  const rl = await checkAndIncrement(RATE_LIMIT_BUCKET(ip), SMTP_TEST_POLICY);
  if (!rl.allowed) {
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

  /* 2. Parse request body. Support JSON only (consistent with Email Scorer). */
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: 'Invalid request body', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  /* 3. Shallow validation. Deeper validation lives in runSmtpTest which
        returns structured failures we can surface directly. */
  if (!body || typeof body !== 'object') {
    return Response.json(
      { ok: false, error: 'Request body must be an object', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  /* 4. Run the test. The probe module handles SSRF, port validation, and
        timeouts. It never throws - always returns a shaped result. */
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

  /* 5. Map verdict to HTTP status so clients (and proxies/CDNs) can handle
        them sensibly. Tests that reach the probe but fail the handshake are
        still 200 - the request itself succeeded. Only a validation failure
        BEFORE the probe runs gets a 4xx here. */
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

/* GETs are 405 so bots and curious visitors don't get empty 200s. */
export function loader() {
  return Response.json({ ok: false, error: 'Use POST' }, { status: 405 });
}
