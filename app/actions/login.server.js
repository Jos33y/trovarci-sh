/**
 * Login action.
 *
 * Security notes:
 *   - Error messages are deliberately generic ("Email or password incorrect")
 *     regardless of whether the email exists. authenticateUser() equalizes
 *     timing between the two paths via a dummy argon2 verify.
 *   - Two-axis rate limiting: per-IP (stops bots from one network) and
 *     per-email (stops credential stuffing targeting one account).
 *   - On successful login the per-email bucket is cleared so the user does
 *     not get locked out by their own earlier typos.
 *   - redirectTo is validated against open-redirect attacks.
 */

import { data, redirect } from 'react-router';
import { authenticateUser } from '~/utils/auth.server.js';
import { createSession, serializeSessionCookie, SESSION_REMEMBER_MS } from '~/utils/session.server.js';
import { recordEvent, buildEventFromRequest } from '~/utils/analytics.server';
import {
  checkAndIncrement,
  resetBucket,
  rateLimitKeys,
  rateLimitPolicies,
} from '~/utils/rateLimit.server.js';
import {
  validateEmail,
  validatePassword,
  safeRedirect,
} from '~/utils/validation.server.js';

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

function userAgent(request) {
  return request.headers.get('user-agent')?.slice(0, 500) || null;
}

const GENERIC_AUTH_ERROR = 'Email or password incorrect';

export async function loginAction({ request }) {
  const form = await request.formData();

  const emailRaw    = form.get('email');
  const passwordRaw = form.get('password');
  const redirectRaw = form.get('redirectTo');

  // Funnel: auth_submit (login). Recorded unconditionally so we can see
  // submit-vs-success conversion. No PII (no email in metadata).
  recordEvent(buildEventFromRequest(request, {
    eventType: 'auth_submit',
    path: '/login',
    userId: null,
    metadata: { kind: 'login' },
  }));

  const emailResult = validateEmail(emailRaw);
  // For login we deliberately do NOT surface granular validation errors.
  // An attacker probing "is this email registered" gets the same message
  // whether the email is malformed, the password is wrong, or the user is
  // absent. Frontend UX can still require fields via HTML attributes.
  if (!emailResult.ok) {
    return data({ errors: { _form: GENERIC_AUTH_ERROR } }, { status: 400 });
  }
  if (typeof passwordRaw !== 'string' || !passwordRaw) {
    return data({ errors: { _form: GENERIC_AUTH_ERROR } }, { status: 400 });
  }

  const ip = clientIp(request);
  const email = emailResult.value;

  // Per-IP rate limit (5 / 15 min).
  if (ip) {
    const rl = await checkAndIncrement(
      rateLimitKeys.loginByIp(ip),
      rateLimitPolicies.loginByIp,
    );
    if (!rl.allowed) {
      return data(
        { errors: { _form: 'Too many login attempts. Try again shortly.' } },
        {
          status: 429,
          headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : {},
        },
      );
    }
  }

  // Per-email rate limit (10 / 15 min).
  const rlEmail = await checkAndIncrement(
    rateLimitKeys.loginByEmail(email),
    rateLimitPolicies.loginByEmail,
  );
  if (!rlEmail.allowed) {
    return data(
      { errors: { _form: 'Too many login attempts for this account. Try again shortly.' } },
      {
        status: 429,
        headers: rlEmail.retryAfterSeconds ? { 'Retry-After': String(rlEmail.retryAfterSeconds) } : {},
      },
    );
  }

  // Fixed-cost password verify (timing-equalized on miss).
  const auth = await authenticateUser(email, passwordRaw);
  if (!auth.ok) {
    return data({ errors: { _form: GENERIC_AUTH_ERROR } }, { status: 401 });
  }

  // Success. Clear the per-email bucket so honest users are not locked out
  // by their own earlier typos.
  await resetBucket(rateLimitKeys.loginByEmail(email));

  // Remember-me extends session lifetime from 7 days (default) to 30 days.
  // Form sends "on" when checked, undefined when not - both treated safely.
  // SESSION_REMEMBER_MS lives in session.server.js and was always there;
  // we hadn't yet wired it to a UI control.
  const remember = form.get('remember') === 'on';
  const session = await createSession(auth.user.id, {
    userAgent: userAgent(request),
    ipAddress: ip,
    ...(remember ? { durationMs: SESSION_REMEMBER_MS } : {}),
  });

  // Funnel: login success. Now we have user_id - link the journey.
  recordEvent(buildEventFromRequest(request, {
    eventType: 'auth_success',
    path: '/login',
    userId: auth.user.id,
    metadata: { kind: 'login', remember },
  }));

  const destination = safeRedirect(
    typeof redirectRaw === 'string' ? redirectRaw : null,
    '/dashboard',
  );

  throw redirect(destination, {
    headers: { 'Set-Cookie': serializeSessionCookie(session.token, session.expiresAt) },
  });
}
