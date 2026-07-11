// POST /login - authenticates and issues session cookie. Timing-equalised on miss to prevent user enumeration.

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

// Fire auth_error with metadata.kind='login'. Never throws.
function recordLoginError(request, code, extra = {}) {
  try {
    recordEvent(buildEventFromRequest(request, {
      eventType: 'auth_error',
      path: '/login',
      userId: null,
      metadata: { kind: 'login', code, ...extra },
    }));
  } catch { /* analytics failure must not block auth */ }
}

export async function loginAction({ request }) {
  const form = await request.formData();

  const emailRaw    = form.get('email');
  const passwordRaw = form.get('password');
  const redirectRaw = form.get('redirectTo');

  recordEvent(buildEventFromRequest(request, {
    eventType: 'auth_submit',
    path: '/login',
    userId: null,
    metadata: { kind: 'login' },
  }));

  const emailResult = validateEmail(emailRaw);
  if (!emailResult.ok) {
    recordLoginError(request, 'BAD_INPUT', { field: 'email' });
    return data({ errors: { _form: GENERIC_AUTH_ERROR } }, { status: 400 });
  }
  if (typeof passwordRaw !== 'string' || !passwordRaw) {
    recordLoginError(request, 'BAD_INPUT', { field: 'password' });
    return data({ errors: { _form: GENERIC_AUTH_ERROR } }, { status: 400 });
  }

  const ip = clientIp(request);
  const email = emailResult.value;

  if (ip) {
    const rl = await checkAndIncrement(
      rateLimitKeys.loginByIp(ip),
      rateLimitPolicies.loginByIp,
    );
    if (!rl.allowed) {
      recordLoginError(request, 'RATE_LIMITED_IP');
      return data(
        { errors: { _form: 'Too many login attempts. Try again shortly.' } },
        {
          status: 429,
          headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : {},
        },
      );
    }
  }

  const rlEmail = await checkAndIncrement(
    rateLimitKeys.loginByEmail(email),
    rateLimitPolicies.loginByEmail,
  );
  if (!rlEmail.allowed) {
    recordLoginError(request, 'RATE_LIMITED_EMAIL');
    return data(
      { errors: { _form: 'Too many login attempts for this account. Try again shortly.' } },
      {
        status: 429,
        headers: rlEmail.retryAfterSeconds ? { 'Retry-After': String(rlEmail.retryAfterSeconds) } : {},
      },
    );
  }

  const auth = await authenticateUser(email, passwordRaw);
  if (!auth.ok) {
    recordLoginError(request, 'CREDENTIALS_INVALID');
    return data({ errors: { _form: GENERIC_AUTH_ERROR } }, { status: 401 });
  }

  // Clear per-email bucket so honest users are not locked out by their own typos.
  await resetBucket(rateLimitKeys.loginByEmail(email));

  const remember = form.get('remember') === 'on';
  const session = await createSession(auth.user.id, {
    userAgent: userAgent(request),
    ipAddress: ip,
    ...(remember ? { durationMs: SESSION_REMEMBER_MS } : {}),
  });

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
