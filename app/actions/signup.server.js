/**
 * Signup action. Handles four form intents from /signup:
 *
 *   intent=create_account   - step 1: validate, create user, send code
 *   intent=verify_code      - step 2: verify code, mark verified, issue session
 *   intent=resend_code      - step 2 resend: rate-limited reissue + send
 *   intent=change_email     - step 2: clear pending cookie, back to step 1
 *
 * The component determines step from the presence of the pending verification
 * cookie (read by the loader), not from action data. This keeps the flow
 * resilient across page refreshes and failed verifications.
 */

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

export async function signupAction({ request }) {
  const form = await request.formData();
  const intent = String(form.get('intent') || 'create_account');

  // Funnel: every signup step, regardless of outcome.
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

  return data({ errors: { _form: 'Unknown action' } }, { status: 400 });
}

// -----------------------------------------------------------------------
// Step 1
// -----------------------------------------------------------------------
async function handleCreateAccount(request, form) {
  const ip = clientIp(request);

  if (ip) {
    const rl = await checkAndIncrement(
      rateLimitKeys.signupByIp(ip),
      rateLimitPolicies.signupByIp,
    );
    if (!rl.allowed) {
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
    return data({ errors }, { status: 400 });
  }

  // Compute safe redirect once - used by both real and decoy paths so the
  // attacker cannot distinguish via redirect behavior.
  const redirectRaw = form.get('redirectTo');
  const safeRedirectTo = safeRedirect(
    typeof redirectRaw === 'string' ? redirectRaw : null,
    '/dashboard',
  );

  const created = await createUser(emailResult.value, passwordResult.value);
  if (!created.ok) {
    if (created.reason === 'email_taken') {
      // Email enumeration prevention.
      //
      // Returning a "this email is taken" error here would let any visitor
      // build a list of registered users by submitting candidate emails to
      // /signup. That breaks the same security posture forgot-password.jsx
      // already protects: never reveal whether an email is registered.
      //
      // Strategy: run the same code path as a fresh signup, but with no
      // real user creation, no real verification code, and no real session.
      // The response shape, headers, and timing match a successful signup
      // exactly. The existing user gets a notification email so they can
      // act on it (sign in, reset password, or ignore).
      //
      // Verification attempts in collision mode return generic "incorrect
      // code" errors (handled in handleVerifyCode). Resend attempts fire
      // another collision email under the same rate limit policy.

      // Cap at 1 collision email per hour per email to prevent a multi-IP
      // attacker from email-bombing a victim. The IP-level signup rate
      // limit above caps the same-IP case at 10/hour.
      const collisionRl = await checkAndIncrement(
        rateLimitKeys.signupCollisionByEmail(emailResult.value),
        rateLimitPolicies.signupCollisionByEmail,
      );
      if (collisionRl.allowed) {
        try {
          await sendSignupCollisionEmail({ to: emailResult.value });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[signup] collision email send failed:', err);
          // Swallow - never leak the collision via error states.
        }
      }

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
    // Other createUser failures (DB error, etc) - keep the message generic
    // so it does not leak whether the email is taken via failure mode.
    return data(
      { errors: { _form: 'Could not create account. Try again in a moment.' } },
      { status: 500 },
    );
  }

  const { code } = await issueVerificationCode(created.user.id, 'signup');

  try {
    await sendVerificationCodeEmail({ to: created.user.email, code });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[signup] verification email send failed:', err);
  }

  // Funnel: account created + OTP dispatched. Welcome credits already
  // landed inside createUser (see auth.server.js); we record the
  // bonus separately at signup-complete because the user can't actually
  // spend them until verify_code passes.
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

// -----------------------------------------------------------------------
// Step 2: verify
// -----------------------------------------------------------------------
async function handleVerifyCode(request, form) {
  const pending = await pendingVerificationCookie.parse(request.headers.get('Cookie'));

  // Cookie must contain either a real userId OR the collision flag.
  // Anything else means the session was tampered with or expired.
  if (!pending?.userId && !pending?.collision) {
    return data(
      { errors: { _form: 'Your verification session expired. Start again.' } },
      { status: 400 },
    );
  }

  const codeResult = validateVerificationCode(form.get('code'));
  if (!codeResult.ok) {
    return data({ errors: { code: codeResult.error } }, { status: 400 });
  }

  // Collision case: never reveal whether the code matched anything. Always
  // return the same "incorrect" message a real failed verify would return.
  // The attacker cannot distinguish a real wrong code from a decoy session.
  if (pending.collision) {
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
    return data({ errors: { code: message } }, { status: 400 });
  }

  await markEmailVerified(pending.userId);

  // Welcome email. Sent only after successful verification so we never
  // welcome someone who never confirmed their address. Failure here is
  // non-fatal - we do not block the signup completion if Resend hiccups.
  try {
    await sendAccountCreatedEmail({
      to: pending.email,
      welcomeCredits: WELCOME_BONUS_AMOUNT,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[signup] welcome email send failed:', err);
  }

  const session = await createSession(pending.userId, {
    userAgent: userAgent(request),
    ipAddress: clientIp(request),
  });

  // Funnel: signup completed end-to-end. Sync record so we never lose a
  // signup-conversion event - this is the only point where welcome
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

  // Honor the redirect the user originally intended. safeRedirect is applied
  // again at read time: the cookie is HMAC-signed but defense in depth costs
  // us nothing here and protects against any future cookie-handling bugs.
  const destination = safeRedirect(pending.redirectTo, '/dashboard');

  throw redirect(destination, { headers });
}

// -----------------------------------------------------------------------
// Step 2: resend
// -----------------------------------------------------------------------
async function handleResendCode(request) {
  const pending = await pendingVerificationCookie.parse(request.headers.get('Cookie'));
  if (!pending?.userId && !pending?.collision) {
    return data(
      { errors: { _form: 'Your verification session expired. Start again.' } },
      { status: 400 },
    );
  }

  // Use email-based bucket key for collision (no userId). Real users keyed
  // by userId, decoy sessions keyed by email - separate buckets, same caps,
  // identical UX from outside.
  const rateLimitSubject = pending.userId || `collision:${pending.email}`;

  const perMinute = await checkAndIncrement(
    rateLimitKeys.resendCodeByUser(rateLimitSubject) + ':min',
    rateLimitPolicies.resendCodePerMinute,
  );
  if (!perMinute.allowed) {
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
    return data(
      { errors: { _form: 'Too many code requests. Try again later.' } },
      { status: 429 },
    );
  }

  // Collision case: resend the notification email instead of a real code.
  // From the attacker's perspective this looks identical to a real resend.
  if (pending.collision) {
    try {
      await sendSignupCollisionEmail({ to: pending.email });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[signup] collision resend send failed:', err);
      return data({ errors: { _form: 'Could not send email. Try again in a moment.' } }, { status: 500 });
    }
    return data({ resent: true, email: pending.email });
  }

  const { code } = await issueVerificationCode(pending.userId, 'signup');

  try {
    await sendVerificationCodeEmail({ to: pending.email, code });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[signup] resend email send failed:', err);
    return data({ errors: { _form: 'Could not send email. Try again in a moment.' } }, { status: 500 });
  }

  return data({ resent: true, email: pending.email });
}

// -----------------------------------------------------------------------
// Step 2: change email (back to step 1)
// -----------------------------------------------------------------------
async function handleChangeEmail(request) {
  // Preserve the user's original redirect intent when bouncing back to
  // step 1. Without this, changing email silently drops their destination.
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
