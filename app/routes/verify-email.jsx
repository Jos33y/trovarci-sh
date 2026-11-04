// /verify-email - a signed-in account that skipped the code at signup verifies here, or fixes a mistyped email.

import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import { markEmailVerified } from '~/utils/auth.server';
import { issueVerificationCode, verifyCode } from '~/utils/verification.server';
import { sendVerificationCodeEmail } from '~/utils/email.server';
import { checkAndIncrement, rateLimitKeys, rateLimitPolicies } from '~/utils/rateLimit.server';
import { validateEmail, validateVerificationCode } from '~/utils/validation.server';
import { sql } from '~/utils/db.server';
import styles from '~/styles/modules/routes/signup.module.css';

export const meta = () => [
  { title: 'Verify your email | Trovarcis Reach' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  const user = await requireUser(request);
  if (user.emailVerifiedAt) throw redirect('/dashboard');
  return { email: user.email };
}

// Same buckets as the signup step, so moving between the two pages gives no extra codes.
async function sendCode(userId, email) {
  const key = rateLimitKeys.resendCodeByUser(userId);
  const perMinute = await checkAndIncrement(`${key}:min`, rateLimitPolicies.resendCodePerMinute);
  if (!perMinute.allowed) return `Wait ${perMinute.retryAfterSeconds || 60} seconds before requesting another code.`;
  const perHour = await checkAndIncrement(`${key}:hr`, rateLimitPolicies.resendCodePerHour);
  if (!perHour.allowed) return 'Too many code requests. Try again in an hour.';

  const { code } = await issueVerificationCode(userId, 'signup');
  try {
    await sendVerificationCodeEmail({ to: email, code });
  } catch (err) {
    console.error('[verify-email] send failed:', err.message);
    return 'Could not send the email. Try again in a moment.';
  }
  return null;
}

export async function action({ request }) {
  const user = await requireUser(request);
  if (user.emailVerifiedAt) throw redirect('/dashboard');
  const form = await request.formData();
  const intent = String(form.get('intent') || '');

  if (intent === 'send') {
    const error = await sendCode(user.id, user.email);
    return error ? data({ error }, { status: 429 }) : { sent: user.email };
  }

  if (intent === 'verify') {
    const checked = validateVerificationCode(String(form.get('code') || '').replace(/\s+/g, ''));
    if (!checked.ok) return data({ codeError: checked.error, sent: user.email }, { status: 400 });
    const result = await verifyCode(user.id, checked.value, 'signup');
    if (!result.ok) {
      const codeError = {
        no_code: 'No active code. Send a new one.',
        expired: 'This code has expired. Send a new one.',
        too_many_attempts: 'Too many attempts. Send a new code.',
      }[result.reason] || 'That code is incorrect.';
      return data({ codeError, sent: user.email }, { status: 400 });
    }
    await markEmailVerified(user.id);
    throw redirect('/dashboard');
  }

  if (intent === 'change') {
    const checked = validateEmail(String(form.get('email') || ''));
    if (!checked.ok) return data({ emailError: checked.error, changing: true }, { status: 400 });
    if (checked.value === String(user.email).toLowerCase()) return data({ emailError: 'That is already your email.', changing: true }, { status: 400 });
    try {
      await sql`UPDATE users SET email = ${checked.value} WHERE id = ${user.id} AND email_verified_at IS NULL AND deleted_at IS NULL`;
    } catch (err) {
      if (err.code === '23505') return data({ emailError: 'That email belongs to another account. Sign in to it instead.', changing: true }, { status: 400 });
      if (err.code === '23514') return data({ emailError: 'Enter a valid email.', changing: true }, { status: 400 });
      throw err;
    }
    const error = await sendCode(user.id, checked.value);
    return error ? data({ error, sent: null }, { status: 429 }) : { sent: checked.value };
  }

  return data({ error: 'Unknown action.' }, { status: 400 });
}

export default function VerifyEmail() {
  const { email } = useLoaderData();
  const a = useActionData() || {};
  const busy = useNavigation().state === 'submitting';
  const sentTo = a.sent || null;

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Verify your email</h1>
          <p className={styles.subtitle}>
            {sentTo ? <>We sent a 6-digit code to <span className={styles.emailHighlight}>{sentTo}</span>.</> : <>Confirm <span className={styles.emailHighlight}>{email}</span> so you never lose access to your account.</>}
          </p>

          {a.error && <div className={styles.errorBanner} role="alert">{a.error}</div>}

          {sentTo ? (
            <>
              <Form method="post" className={styles.form}>
                <input type="hidden" name="intent" value="verify" />
                <div className={styles.field}>
                  <label htmlFor="code" className={styles.label}>Code</label>
                  <input id="code" name="code" className={styles.input} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456…" autoFocus />
                  {a.codeError && <p className={styles.fieldError} role="alert">{a.codeError}</p>}
                </div>
                <button type="submit" className={styles.submitBtn} disabled={busy}>{busy ? 'Verifying…' : 'Verify email'}</button>
              </Form>
              <p className={styles.spamHint}>Not in your inbox? Check spam or junk. It comes from relay.trovarci.sh.</p>
              <div className={styles.resendRow}>
                Didn't get it?{' '}
                <Form method="post" className={styles.inlineForm}>
                  <input type="hidden" name="intent" value="send" />
                  <button type="submit" className={styles.resendBtn} disabled={busy}>Resend code</button>
                </Form>
              </div>
            </>
          ) : (
            <Form method="post" className={styles.form}>
              <input type="hidden" name="intent" value="send" />
              <button type="submit" className={styles.submitBtn} disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
            </Form>
          )}

          <Form method="post" className={styles.form}>
            <input type="hidden" name="intent" value="change" />
            <div className={styles.field}>
              <label htmlFor="new-email" className={styles.label}>Wrong email? Change it</label>
              <input id="new-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck="false" className={styles.input} placeholder="Your email" />
              {a.emailError && <p className={styles.fieldError} role="alert">{a.emailError}</p>}
            </div>
            <button type="submit" className={styles.linkBtn} disabled={busy}>Change email and send code</button>
          </Form>

          <p className={styles.resendRow}><Link to="/dashboard" className={styles.footerLink}>Later</Link></p>
        </div>
      </main>
      <Footer />
    </>
  );
}
