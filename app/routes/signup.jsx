import { useState, useRef, useEffect } from 'react';
import {
  Link,
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useFetcher,
} from 'react-router';
import { TrovarcisReachLogo } from '~/components/shared/Logo';
import { requireGuest, pendingVerificationCookie } from '~/utils/session.server';
import { safeRedirect } from '~/utils/validation.server';
import styles from '~/styles/modules/routes/signup.module.css';

export { signupAction as action } from '~/actions/signup.server';

export const meta = () => [
  { title: 'Create Account | Trovarcis Reach' },
  {
    name: 'description',
    content: 'Create your free Trovarcis Reach account to start using the email and DNS tools.',
  },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }) {
  // If already signed in, honor the redirectTo hint instead of dumping the
  // user on /dashboard. Keeps the "I came here to score an email" intent
  // intact even if they signed in on another tab.
  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'), null);
  await requireGuest(request, { redirectTo: redirectTo || '/dashboard' });

  const pending = await pendingVerificationCookie.parse(request.headers.get('Cookie'));
  return {
    pendingEmail: pending?.email || null,
    redirectTo: redirectTo || '',
  };
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

function MailIcon() { 
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const CODE_LENGTH = 6;

export default function SignupPage() {
  const { pendingEmail, redirectTo } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const resendFetcher = useFetcher();

  // Step is derived from the server. Pending cookie present = step 2.
  const step = pendingEmail ? 2 : 1;

  // Display email on step 2: prefer fresh action data, fall back to loader.
  const displayEmail = actionData?.email || pendingEmail || '';

  // Error state. Field-specific errors come from the server; the "passwords
  // don't match" red border is still driven locally for instant feedback.
  const errors = actionData?.errors || {};
  const resendError = resendFetcher.data?.errors?._form;
  const resentOk = resendFetcher.data?.resent === true && !resendError;

  // Navigation-derived loading flags keyed by intent.
  const submittingIntent =
    navigation.state !== 'idle' ? navigation.formData?.get('intent') : null;
  const isCreating = submittingIntent === 'create_account';
  const isVerifying = submittingIntent === 'verify_code';
  const isChangingEmail = submittingIntent === 'change_email';
  const isResending = resendFetcher.state === 'submitting';

  // Controlled fields needed for strength bar / mismatch indicator.
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Code digits. Reset when the pending email changes (fresh account created,
  // or user went back to step 1 via change_email).
  const [code, setCode] = useState(() => Array(CODE_LENGTH).fill(''));
  const codeRefs = useRef([]);
  useEffect(() => {
    setCode(Array(CODE_LENGTH).fill(''));
  }, [pendingEmail]);

  function handleCodeChange(i, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[i] = val;
    setCode(next);
    if (val && i < CODE_LENGTH - 1) {
      codeRefs.current[i + 1]?.focus();
    }
  }

  function handleCodeKeyDown(i, e) {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      codeRefs.current[i - 1]?.focus();
    }
  }

  function handleCodePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    const next = [...code];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    codeRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  const joinedCode = code.join('');
  const formError = errors._form || resendError;

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Link to="/" aria-label="Trovarcis Reach home">
            <TrovarcisReachLogo size={40} />
          </Link>
        </div>

        <div className={styles.steps}>
          <div className={[styles.step, step >= 1 ? styles.stepActive : ''].join(' ')}>
            <span className={styles.stepNum}>1</span>
            <span className={styles.stepLabel}>Account</span>
          </div>
          <div className={styles.stepLine} />
          <div className={[styles.step, step >= 2 ? styles.stepActive : ''].join(' ')}>
            <span className={styles.stepNum}>2</span>
            <span className={styles.stepLabel}>Verify</span>
          </div>
        </div>

        {formError && (
          <div className={styles.errorBanner} role="alert">
            {formError}
          </div>
        )}

        {resentOk && !formError && (
          <div className={styles.successBanner} role="status">
            A new code was sent. Check your inbox.
          </div>
        )}

        {/* Step 1: Account creation */}
        {step === 1 && (
          <>
            <h1 className={styles.title}>Create your account</h1>
            <p className={styles.subtitle}>Free to start. No credit card required.</p>

            <Form method="post" className={styles.form} noValidate>
              <input type="hidden" name="intent" value="create_account" />
              {redirectTo && (
                <input type="hidden" name="redirectTo" value={redirectTo} />
              )}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  className={styles.input}
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  aria-invalid={errors.email ? true : undefined}
                />
                {errors.email && <p className={styles.fieldError}>{errors.email}</p>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">Password</label>
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
                <label className={styles.label} htmlFor="confirm">Confirm password</label>
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

              <label className={styles.checkboxRow}>
                <input
                  name="terms"
                  className={styles.checkbox}
                  type="checkbox"
                  required
                />
                <span className={styles.checkboxLabel}>
                  I agree to the{' '}
                  <Link to="/terms" className={styles.termsLink}>Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className={styles.termsLink}>Privacy Policy</Link>
                </span>
              </label>
              {errors.terms && <p className={styles.fieldError}>{errors.terms}</p>}

              <button
                className={styles.submitBtn}
                type="submit"
                disabled={isCreating}
              >
                {isCreating ? 'Creating account...' : 'Create account'}
              </button>
            </Form>

            <div className={styles.signinRow}>
              Already have an account?{' '}
              <Link
                to={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
                className={styles.signinLink}
              >Sign in</Link>
            </div>
          </>
        )}

        {/* Step 2: Email verification */}
        {step === 2 && (
          <>
            <div className={styles.verifyIcon}>
              <MailIcon />
            </div>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              We sent a 6-digit code to{' '}
              <strong className={styles.emailHighlight}>{displayEmail}</strong>.
              Enter it below.
            </p>

            <Form method="post" className={styles.form} noValidate>
              <input type="hidden" name="intent" value="verify_code" />
              <input type="hidden" name="code" value={joinedCode} />

              <div className={styles.codeRow} onPaste={handleCodePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (codeRefs.current[i] = el)}
                    className={[styles.codeInput, digit ? styles.codeInputFilled : ''].join(' ')}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {errors.code && (
                <div className={styles.errorBanner} role="alert">
                  {errors.code}
                </div>
              )}

              <button
                className={styles.submitBtn}
                type="submit"
                disabled={isVerifying || joinedCode.length < CODE_LENGTH}
              >
                {isVerifying ? 'Verifying...' : 'Verify email'}
              </button>
            </Form>

            <div className={styles.resendRow}>
              Didn't get it?{' '}
              <resendFetcher.Form method="post" className={styles.inlineForm}>
                <input type="hidden" name="intent" value="resend_code" />
                <button
                  type="submit"
                  className={styles.resendBtn}
                  disabled={isResending}
                >
                  {isResending ? 'Sending...' : 'Resend code'}
                </button>
              </resendFetcher.Form>
              {' '}or{' '}
              <Form method="post" className={styles.inlineForm}>
                <input type="hidden" name="intent" value="change_email" />
                <button
                  type="submit"
                  className={styles.backBtn}
                  disabled={isChangingEmail}
                >
                  change email
                </button>
              </Form>
            </div>
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
