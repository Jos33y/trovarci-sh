// POST /signup - four intents from the same action (create_account, verify_code, resend_code, change_email).
// Step is determined by the pending verification cookie, not by action data - resilient across refreshes.

import { data, redirect } from 'react-router';
import { createUser, markEmailVerified } from '~/utils/auth.server';
import {
  createSession,
  serializeSessionCookie,
  pendingVerificationCookie,
} from '~/utils/session.server';
import {
  issueVerificationCode,
  verifyCode,
} from '~/utils/verification.server';
import { sendVerificationCodeEmail, sendSignupCollisionEmail, sendAccountCreatedEmail } from '~/utils/email.server';
import { WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import { recordEvent, recordEventSync, buildEventFromRequest } from '~/utils/analytics.server';
import {
  checkAndIncrement,
  rateLimitKeys,
  rateLimitPolicies,
} from '~/utils/rateLimit.server';
import {
  validateEmail,
  validatePassword,
  validateVerificationCode,
  safeRedirect,
} from '~/utils/validation.server';

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

function userAgent(request) {
  return request.headers.get('user-agent')?.slice(0, 500) || null;
}

// Fire auth_error with metadata.kind='signup'. Never throws.
function recordSignupError(request, step, code, extra = {}) {
  try {
    recordEvent(buildEventFromRequest(request, {
      eventType: 'auth_error',
      path: '/signup',
      userId: extra.userId ?? null,
      metadata: { kind: 'signup', step, code, ...extra },
    }));
  } catch { /* analytics failure must not block auth */ }
}

export async function signupAction({ request }) {
  const form = await request.formData();
  const intent = String(form.get('intent') || 'create_account');

  recordEvent(buildEventFromRequest(request, {
    eventType: 'auth_submit',
    path: '/signup',
    userId: null,
    metadata: { kind: 'signup', intent },
  }));

  if (intent === 'create_account') return handleCreateAccount(request, form);
  if (intent === 'verify_code')    return handleVerifyCode(request, form);
  if (intent === 'resend_code')    return handleResendCode(request);
  if (intent === 'change_email')   return handleChangeEmail(request);

  recordSignupError(request, 'unknown', 'UNKNOWN_INTENT');
  return data({ errors: { _form: 'Unknown action' } }, { status: 400 });
}

async function handleCreateAccount(request, form) {
  const ip = clientIp(request);

  if (ip) {
    const rl = await checkAndIncrement(
      rateLimitKeys.signupByIp(ip),
      rateLimitPolicies.signupByIp,
    );
    if (!rl.allowed) {
      recordSignupError(request, 'create_account', 'RATE_LIMITED_IP');
      return data(
        { errors: { _form: 'Too many signups from this network. Try again later.' } },
        { status: 429, headers: rl.retryAfterSeconds ? { 'Retry-After': String(rl.retryAfterSeconds) } : {} },
      );
    }
  }

  const emailResult    = validateEmail(form.get('email'));
  const passwordResult = validatePassword(form.get('password'));
  const confirm        = String(form.get('confirmPassword') || '');
  const termsAccepted  = form.get('terms') === 'on' || form.get('terms') === 'true';

  const errors = {};
  if (!emailResult.ok)    errors.email    = emailResult.error;
  if (!passwordResult.ok) errors.password = passwordResult.error;
  if (passwordResult.ok && confirm !== passwordResult.value) {
    errors.confirmPassword = 'Passwords do not match';
  }
  if (!termsAccepted) errors.terms = 'You must accept the Terms and Privacy Policy';

  if (Object.keys(errors).length > 0) {
    recordSignupError(request, 'create_account', 'VALIDATION', {
      fields: Object.keys(errors).join(','),
    });
    return data({ errors }, { status: 400 });
  }

  const redirectRaw = form.get('redirectTo');
  const safeRedirectTo = safeRedirect(
    typeof redirectRaw === 'string' ? redirectRaw : null,
    '/dashboard',
  );

  const created = await createUser(emailResult.value, passwordResult.value);
  if (!created.ok) {
    if (created.reason === 'email_taken') {
      // Email enumeration prevention: run the same code path as a fresh signup
      // (no real user creation, no real code, no real session). Response shape,
      // headers, and timing match a successful signup exactly. Existing user
      // gets a notification email. Verification attempts return generic errors.
      // Cap collision emails at 1/hour per email to prevent multi-IP bombing.
      const collisionRl = await checkAndIncrement(
        rateLimitKeys.signupCollisionByEmail(emailResult.value),
        rateLimitPolicies.signupCollisionByEmail,
      );
      if (collisionRl.allowed) {
        try {
          await sendSignupCollisionEmail({ to: emailResult.value });
        } catch (err) {
          console.error('[signup] collision email send failed:', err);
        }
      }

      // Internal signal only - user sees the decoy verify step.
      recordSignupError(request, 'create_account', 'EMAIL_TAKEN');

      const decoyCookie = await pendingVerificationCookie.serialize({
        userId: null,
        email: emailResult.value,
        redirectTo: safeRedirectTo,
        collision: true,
      });

      return data(
        { step: 'verify', email: emailResult.value },
        { headers: { 'Set-Cookie': decoyCookie } },
      );
    }
    // Generic message so failure mode does not leak whether email is taken.
    recordSignupError(request, 'create_account', 'CREATE_FAILED');
    return data(
      { errors: { _form: 'Could not create account. Try again in a moment.' } },
      { status: 500 },
    );
  }

  const { code } = await issueVerificationCode(created.user.id, 'signup');

  try {
    await sendVerificationCodeEmail({ to: created.user.email, code });
  } catch (err) {
    console.error('[signup] verification email send failed:', err);
    recordSignupError(request, 'create_account', 'OTP_SEND_FAILED', { userId: created.user.id });
    // Note: we still proceed. User can resend from step 2.
  }

  recordEvent(buildEventFromRequest(request, {
    eventType: 'auth_otp_sent',
    path: '/signup',
    userId: created.user.id,
    metadata: { kind: 'signup' },
  }));

  const pendingCookie = await pendingVerificationCookie.serialize({
    userId: created.user.id,
    email: created.user.email,
    redirectTo: safeRedirectTo,
  });

  return data(
    { step: 'verify', email: created.user.email },
    { headers: { 'Set-Cookie': pendingCookie } },
  );
}

async function handleVerifyCode(request, form) {
  const pending = await pendingVerificationCookie.parse(request.headers.get('Cookie'));

  // Cookie must contain a real userId OR the collision flag. Anything else = tamper/expiry.
  if (!pending?.userId && !pending?.collision) {
    recordSignupError(request, 'verify_code', 'SESSION_EXPIRED');
    return data(
      { errors: { _form: 'Your verification session expired. Start again.' } },
      { status: 400 },
    );
  }

  const codeResult = validateVerificationCode(form.get('code'));
  if (!codeResult.ok) {
    recordSignupError(request, 'verify_code', 'BAD_CODE_FORMAT', {
      userId: pending.userId ?? null,
    });
    return data({ errors: { code: codeResult.error } }, { status: 400 });
  }

  // Collision case: never reveal whether the code matched. Same "incorrect" message a real
  // failed verify would return. Attacker cannot distinguish real vs decoy.
  if (pending.collision) {
    recordSignupError(request, 'verify_code', 'INVALID_CODE_COLLISION');
    return data({ errors: { code: 'That code is incorrect' } }, { status: 400 });
  }

  const result = await verifyCode(pending.userId, codeResult.value, 'signup');

  if (!result.ok) {
    const message = {
      no_code:           'No active code. Request a new one.',
      expired:           'This code has expired. Request a new one.',
      too_many_attempts: 'Too many attempts. Request a new code.',
      invalid_code:      'That code is incorrect',
    }[result.reason] || 'Verification failed';
    recordSignupError(request, 'verify_code', String(result.reason || 'unknown').toUpperCase(), {
      userId: pending.userId,
    });
    return data({ errors: { code: message } }, { status: 400 });
  }

  await markEmailVerified(pending.userId);

  // Welcome email only after successful verification. Failure here is non-fatal.
  try {
    await sendAccountCreatedEmail({
      to: pending.email,
      welcomeCredits: WELCOME_BONUS_AMOUNT,
    });
  } catch (err) {
    console.error('[signup] welcome email send failed:', err);
  }

  const session = await createSession(pending.userId, {
    userAgent: userAgent(request),
    ipAddress: clientIp(request),
  });

  // Sync record - never lose a signup conversion. This is the only point where welcome
  // credits become spendable and the user has a usable session.
  await recordEventSync({
    event_type: 'auth_signup_complete',
    session_hash: 'system',
    user_id: pending.userId,
    path: '/signup',
    country: 'XX',
    device_class: 'unknown',
    is_bot: false,
    metadata: { welcome_credits: WELCOME_BONUS_AMOUNT },
  }).catch((err) => console.error('[signup] funnel record failed:', err.message));

  const headers = new Headers();
  headers.append('Set-Cookie', serializeSessionCookie(session.token, session.expiresAt));
  headers.append('Set-Cookie', await pendingVerificationCookie.serialize('', { maxAge: 0 }));

  // Honor original redirect intent. safeRedirect at read time is defense in depth
  // even though the cookie is HMAC-signed.
  const destination = safeRedirect(pending.redirectTo, '/dashboard');

  throw redirect(destination, { headers });
}

async function handleResendCode(request) {
  const pending = await pendingVerificationCookie.parse(request.headers.get('Cookie'));
  if (!pending?.userId && !pending?.collision) {
    recordSignupError(request, 'resend_code', 'SESSION_EXPIRED');
    return data(
      { errors: { _form: 'Your verification session expired. Start again.' } },
      { status: 400 },
    );
  }

  // Real users keyed by userId, decoy sessions keyed by email. Separate buckets, same caps.
  const rateLimitSubject = pending.userId || `collision:${pending.email}`;

  const perMinute = await checkAndIncrement(
    rateLimitKeys.resendCodeByUser(rateLimitSubject) + ':min',
    rateLimitPolicies.resendCodePerMinute,
  );
  if (!perMinute.allowed) {
    recordSignupError(request, 'resend_code', 'RATE_LIMITED_MIN', {
      userId: pending.userId ?? null,
    });
    return data(
      { errors: { _form: `Wait ${perMinute.retryAfterSeconds || 60} seconds before requesting another code` } },
      { status: 429 },
    );
  }
  const perHour = await checkAndIncrement(
    rateLimitKeys.resendCodeByUser(rateLimitSubject) + ':hr',
    rateLimitPolicies.resendCodePerHour,
  );
  if (!perHour.allowed) {
    recordSignupError(request, 'resend_code', 'RATE_LIMITED_HR', {
      userId: pending.userId ?? null,
    });
    return data(
      { errors: { _form: 'Too many code requests. Try again later.' } },
      { status: 429 },
    );
  }

  if (pending.collision) {
    try {
      await sendSignupCollisionEmail({ to: pending.email });
    } catch (err) {
      console.error('[signup] collision resend send failed:', err);
      recordSignupError(request, 'resend_code', 'EMAIL_SEND_FAILED');
      return data({ errors: { _form: 'Could not send email. Try again in a moment.' } }, { status: 500 });
    }
    return data({ resent: true, email: pending.email });
  }

  const { code } = await issueVerificationCode(pending.userId, 'signup');

  try {
    await sendVerificationCodeEmail({ to: pending.email, code });
  } catch (err) {
    console.error('[signup] resend email send failed:', err);
    recordSignupError(request, 'resend_code', 'EMAIL_SEND_FAILED', {
      userId: pending.userId,
    });
    return data({ errors: { _form: 'Could not send email. Try again in a moment.' } }, { status: 500 });
  }

  recordEvent(buildEventFromRequest(request, {
    eventType: 'auth_otp_sent',
    path: '/signup',
    userId: pending.userId,
    metadata: { kind: 'signup', resend: true },
  }));

  return data({ resent: true, email: pending.email });
}

async function handleChangeEmail(request) {
  // Preserve original redirect intent when bouncing back to step 1.
  const pending = await pendingVerificationCookie.parse(request.headers.get('Cookie'));
  const preservedRedirect = safeRedirect(pending?.redirectTo, null);

  const target = preservedRedirect
    ? `/signup?redirectTo=${encodeURIComponent(preservedRedirect)}`
    : '/signup';

  throw redirect(target, {
    headers: {
      'Set-Cookie': await pendingVerificationCookie.serialize('', { maxAge: 0 }),
    },
  });
}
