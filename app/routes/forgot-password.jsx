import {
  Link,
  Form,
  useActionData,
  useNavigation,
  data,
} from 'react-router';
import { TrovarcisReachLogo } from '~/components/shared/Logo';
import { requireGuest } from '~/utils/session.server';
import { sql } from '~/utils/db.server';
import { issuePasswordResetToken } from '~/utils/passwordReset.server';
import { sendPasswordResetEmail } from '~/utils/email.server';
import { validateEmail } from '~/utils/validation.server';
import {
  checkAndIncrement,
  rateLimitKeys,
  rateLimitPolicies,
} from '~/utils/rateLimit.server';
import { getPublicUrl } from '~/utils/paymentsConfig.server';
import styles from '~/styles/modules/routes/login.module.css';

export const meta = () => [
  { title: 'Forgot Password | Trovarcis Reach' },
  { name: 'description', content: 'Reset your Trovarcis Reach password.' },
  { name: 'robots', content: 'noindex' },
];

export async function loader({ request }) {
  await requireGuest(request);
  return null;
}

/* Always return the same "if an account exists, we sent an email" message to prevent enumeration. */
/* Rate limit by IP (drive-by enumeration) and by email (targeted flooding). */
export async function action({ request }) {
  const form = await request.formData();
  const emailResult = validateEmail(form.get('email'));

  // Rate limit regardless of email validity, to prevent format-probe attacks.
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip');

  if (ip) {
    const rl = await checkAndIncrement(
      rateLimitKeys.forgotPasswordByIp(ip),
      rateLimitPolicies.forgotPasswordByIp,
    );
    if (!rl.allowed) {
      return data(
        { errors: { _form: 'Too many requests. Try again shortly.' } },
        { status: 429 },
      );
    }
  }

  if (!emailResult.ok) {
    // Even for invalid emails, return the same success message.
    return data({ ok: true });
  }

  const email = emailResult.value;

  // Per-email rate limit: max 3 reset emails per hour.
  const rlEmail = await checkAndIncrement(
    rateLimitKeys.forgotPasswordByEmail(email),
    rateLimitPolicies.forgotPasswordByEmail,
  );
  if (!rlEmail.allowed) {
    // Still return the same response - don't reveal that we're rate limiting
    // this specific email.
    return data({ ok: true });
  }

  // Look up user. If not found, still return success (don't enumerate).
  const [user] = await sql`
    SELECT id, email FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1
  `;

  if (user) {
    try {
      const { token } = await issuePasswordResetToken(user.id);
      const resetUrl = `${getPublicUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[forgot-password] send failed:', err);
      // Swallow - still return success to avoid leaking info.
    }
  }

  return data({ ok: true });
}

export default function ForgotPasswordPage() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle' && navigation.formData != null;
  const formError = actionData?.errors?._form;
  const submitted = actionData?.ok === true;

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Link to="/" aria-label="Trovarcis Reach home">
            <TrovarcisReachLogo size={40} />
          </Link>
        </div>

        {submitted ? (
          <>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              If an account exists for the email you entered, we sent a password reset link.
              It expires in 1 hour.
            </p>

            <div className={styles.divider}>
              <span>Remember your password?</span>
            </div>

            <Link to="/login" className={styles.signupLink}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Reset your password</h1>
            <p className={styles.subtitle}>
              Enter your email and we will send a reset link.
            </p>

            {formError && (
              <div className={styles.errorBanner} role="alert">
                {formError}
              </div>
            )}

            <Form method="post" className={styles.form} noValidate>
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
                  autoFocus
                />
              </div>

              <button
                className={styles.submitBtn}
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Send reset link'}
              </button>
            </Form>

            <div className={styles.divider}>
              <span>Remember it now?</span>
            </div>

            <Link to="/login" className={styles.signupLink}>
              Back to sign in
            </Link>
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
