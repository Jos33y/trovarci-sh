import { useState } from 'react';
import {
  Link,
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
  useSearchParams,
  data,
  redirect,
} from 'react-router';
import { TrovarcisReachLogo } from '~/components/shared/Logo';
import { requireGuest } from '~/utils/session.server';
import { peekResetToken, consumeResetToken } from '~/utils/passwordReset.server';
import { updatePassword } from '~/utils/auth.server';
import { revokeAllUserSessions } from '~/utils/session.server';
import { validatePassword } from '~/utils/validation.server';
import { sql } from '~/utils/db.server';
import { sendPasswordChangedEmail } from '~/utils/email.server';
import styles from '~/styles/modules/routes/signup.module.css';

export const meta = () => [
  { title: 'Reset Password | Trovarcis Reach' },
  { name: 'robots', content: 'noindex' },
];

/**
 * Loader validates the token for display purposes only. Does not consume it;
 * consumption happens in the action on form submission. This way a user
 * visiting the link twice can still submit the form (once).
 */
export async function loader({ request }) {
  await requireGuest(request);

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  if (!token) {
    return { valid: false, reason: 'missing' };
  }

  const peek = await peekResetToken(token);
  if (!peek) {
    return { valid: false, reason: 'invalid_or_expired' };
  }

  return { valid: true };
}

export async function action({ request }) {
  const form = await request.formData();
  const token    = String(form.get('token') || '');
  const password = String(form.get('password') || '');
  const confirm  = String(form.get('confirmPassword') || '');

  const passwordResult = validatePassword(password);
  const errors = {};
  if (!passwordResult.ok) errors.password = passwordResult.error;
  if (passwordResult.ok && confirm !== passwordResult.value) {
    errors.confirmPassword = 'Passwords do not match';
  }
  if (Object.keys(errors).length > 0) {
    return data({ errors }, { status: 400 });
  }

  const result = await consumeResetToken(token);
  if (!result) {
    return data(
      { errors: { _form: 'This reset link is invalid or has already been used. Request a new one.' } },
      { status: 400 },
    );
  }

  // Apply new password, then revoke all existing sessions for safety.
  // Anyone currently logged in on a stolen device is kicked out immediately.
  await updatePassword(result.userId, passwordResult.value);
  await revokeAllUserSessions(result.userId);

  // Security notification. If the user did not request this change, the
  // email is their alarm bell. Failure to send is non-fatal - never block
  // the user from regaining access to their account because of an email
  // service hiccup.
  try {
    const [user] = await sql`
      SELECT email FROM users WHERE id = ${result.userId} LIMIT 1
    `;
    if (user?.email) {
      await sendPasswordChangedEmail({ to: user.email });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reset-password] notification email send failed:', err);
  }

  // Force sign-in with new password. Pass a hint via query param.
  throw redirect('/login?reset=success');
}

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12C2 12 5.5 5 12 5s10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 3l18 18M10.5 10.7A3 3 0 0014.3 14M6.5 6.6C4.5 8 3 10 3 12c0 0 3.5 7 9 7 2 0 3.8-.7 5.3-1.7M9.9 5.1C10.6 5 11.3 5 12 5c5.5 0 9 7 9 7a16.7 16.7 0 01-2.4 3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const { valid, reason } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const isSubmitting = navigation.state !== 'idle' && navigation.formData != null;
  const errors = actionData?.errors || {};

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Link to="/" aria-label="Trovarcis Reach home">
            <TrovarcisReachLogo size={40} />
          </Link>
        </div>

        {!valid ? (
          <>
            <h1 className={styles.title}>Link expired or invalid</h1>
            <p className={styles.subtitle}>
              {reason === 'missing'
                ? 'This page needs a valid reset link.'
                : 'This reset link has expired or has already been used. Request a new one.'}
            </p>

            <div style={{ marginTop: 24 }}>
              <Link to="/forgot-password" className={styles.submitBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                Request new link
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Set a new password</h1>
            <p className={styles.subtitle}>
              Choose a strong password. You will be signed out of all devices.
            </p>

            {errors._form && (
              <div className={styles.errorBanner} role="alert">
                {errors._form}
              </div>
            )}

            <Form method="post" className={styles.form} noValidate>
              <input type="hidden" name="token" value={token} />

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">New password</label>
                <div className={styles.passwordWrap}>
                  <input
                    id="password"
                    name="password"
                    className={styles.input}
                    type={showPass ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    autoFocus
                    aria-invalid={errors.password ? true : undefined}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon visible={showPass} />
                  </button>
                </div>
                {password.length > 0 && (
                  <div className={styles.strengthBar}>
                    <div
                      className={[
                        styles.strengthFill,
                        password.length < 8
                          ? styles.strengthWeak
                          : password.length < 12
                          ? styles.strengthOk
                          : styles.strengthStrong,
                      ].join(' ')}
                      style={{
                        width: password.length < 8 ? '33%' : password.length < 12 ? '66%' : '100%',
                      }}
                    />
                  </div>
                )}
                {errors.password && <p className={styles.fieldError}>{errors.password}</p>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="confirm">Confirm new password</label>
                <div className={styles.passwordWrap}>
                  <input
                    id="confirm"
                    name="confirmPassword"
                    className={[
                      styles.input,
                      confirm.length > 0 && confirm !== password ? styles.inputError : '',
                    ].join(' ')}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Same password again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    aria-invalid={errors.confirmPassword ? true : undefined}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon visible={showConfirm} />
                  </button>
                </div>
                {errors.confirmPassword && <p className={styles.fieldError}>{errors.confirmPassword}</p>}
              </div>

              <button
                className={styles.submitBtn}
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating...' : 'Update password'}
              </button>
            </Form>
          </>
        )}
      </div>

      <div className={styles.footer}>
        <Link to="/privacy" className={styles.footerLink}>Privacy</Link>
        <span className={styles.footerDot} />
        <Link to="/terms" className={styles.footerLink}>Terms</Link>
        <span className={styles.footerDot} />
        <Link to="/" className={styles.footerLink}>trovarci.sh</Link>
      </div>
    </div>
  );
}
