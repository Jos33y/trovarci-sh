import { useState } from 'react';
import {
  Link,
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { TrovarcisReachLogo } from '~/components/shared/Logo';
import { requireGuest } from '~/utils/session.server';
import { safeRedirect } from '~/utils/validation.server';
import styles from '~/styles/modules/routes/login.module.css';

export { loginAction as action } from '~/actions/login.server';

export const meta = () => [
  { title: 'Sign In | Trovarcis Reach' },
  { name: 'description', content: 'Sign in to your Trovarcis Reach account.' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }) {
  // If the user is already signed in, honor the redirectTo hint instead of
  // bouncing to /dashboard. Then sanitize and pass it to the component so
  // the hidden form input never renders an attacker-controlled value.
  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'), null);
  await requireGuest(request, { redirectTo: redirectTo || '/dashboard' });
  return { redirectTo: redirectTo || '' };
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

export default function LoginPage() {
  const { redirectTo } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const resetJustSucceeded = searchParams.get('reset') === 'success';

  const isSubmitting = navigation.state !== 'idle' && navigation.formData != null;
  const formError = actionData?.errors?._form;

  const [showPass, setShowPass] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Link to="/" aria-label="Trovarcis Reach home">
            <TrovarcisReachLogo size={40} />
          </Link>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to your account to continue.</p>

        {resetJustSucceeded && !formError && (
          <div className={styles.successBanner} role="status">
            Password updated. Sign in with your new password.
          </div>
        )}

        {formError && (
          <div className={styles.errorBanner} role="alert">
            {formError}
          </div>
        )}

        <Form method="post" className={styles.form} noValidate>
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
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="password">Password</label>
              <Link to="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
            </div>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                name="password"
                className={styles.input}
                type={showPass ? 'text' : 'password'}
                placeholder="Your password"
                autoComplete="current-password"
                required
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
          </div>

          <label className={styles.rememberRow}>
            <input
              type="checkbox"
              name="remember"
              className={styles.rememberCheckbox}
            />
            <span className={styles.rememberLabel}>Remember me for 30 days</span>
          </label>

          <button
            className={styles.submitBtn}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </Form>

        <div className={styles.divider}>
          <span>New to Trovarcis?</span>
        </div>

        <Link
          to={redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : '/signup'}
          className={styles.signupLink}
        >
          Create a free account
        </Link>
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
