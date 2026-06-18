/**
 * Email delivery via Resend.
 *
 * Environment variables:
 *   RESEND_API_KEY     - required in production, optional in dev
 *   EMAIL_FROM_ADDRESS - sender address, e.g. 'Trovarcis <hello@trovarci.sh>'
 */

import { Resend } from 'resend';

const isProduction = process.env.NODE_ENV === 'production';

let resend = null;
function getResend() {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (isProduction) {
      throw new Error('RESEND_API_KEY is required in production');
    }
    return null;
  }
  resend = new Resend(key);
  return resend;
}

function getFromAddress() {
  return (
    process.env.EMAIL_FROM_ADDRESS ||
    (isProduction ? null : 'Trovarcis <onboarding@resend.dev>')
  );
}

async function send({ to, subject, html, text }) {
  const client = getResend();

  if (!client) {
    const rule = '='.repeat(60);
    // eslint-disable-next-line no-console
    console.log(`\n${rule}\n[EMAIL DEV MODE] to: ${to}\nsubject: ${subject}\n${rule}\n${text}\n${rule}\n`);
    return { ok: true, id: 'dev-console' };
  }

  const from = getFromAddress();
  if (!from) throw new Error('EMAIL_FROM_ADDRESS is required in production');

  const { data, error } = await client.emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || 'unknown'}`);
  }
  return { ok: true, id: data?.id };
}

// -----------------------------------------------------------------------
// Verification code email (signup)
// -----------------------------------------------------------------------

export async function sendVerificationCodeEmail({ to, code }) {
  const subject = `${code} is your Trovarcis verification code`;

  const text = [
    'Your verification code is:',
    '',
    `    ${code}`,
    '',
    'This code expires in 15 minutes.',
    '',
    "If you did not request this, you can ignore this email.",
    '',
    '-- Trovarcis',
    'https://trovarci.sh',
  ].join('\n');

  return send({ to, subject, html: verificationCodeHtml(code), text });
}

// -----------------------------------------------------------------------
// Password reset email
// -----------------------------------------------------------------------

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const subject = 'Reset your Trovarcis password';

  const text = [
    'We received a request to reset your Trovarcis password.',
    '',
    'To set a new password, click the link below:',
    '',
    resetUrl,
    '',
    'This link expires in 1 hour and can only be used once.',
    '',
    'If you did not request a password reset, you can ignore this email. Your password will not change.',
    '',
    '-- Trovarcis',
    'https://trovarci.sh',
  ].join('\n');

  return send({ to, subject, html: passwordResetHtml(resetUrl), text });
}

// -----------------------------------------------------------------------
// Signup collision email (email enumeration prevention)
// -----------------------------------------------------------------------

/**
 * Notify the existing account holder when someone attempts to sign up
 * using their email. The signup action sends this instead of revealing
 * "this email is taken" in the UI - the response shape on signup is
 * identical for taken vs available emails, but the existing user gets
 * this email so they can act on it.
 *
 * Tone is helpful, not alarming. Most collisions are the legitimate
 * user forgetting they already have an account, not an attack.
 */
export async function sendSignupCollisionEmail({ to }) {
  const subject = 'Someone tried to create a Trovarcis account with your email';

  const text = [
    `Someone tried to create a new Trovarcis Reach account using ${to}.`,
    'You already have an account with this email, so we did not create a new one.',
    '',
    'If this was you trying to sign in:',
    '  Sign in:               https://trovarci.sh/login',
    '  Forgot your password?  https://trovarci.sh/forgot-password',
    '',
    'If this was not you, you can safely ignore this email.',
    'No changes were made to your account.',
    '',
    '-- Trovarcis',
    'https://trovarci.sh',
  ].join('\n');

  return send({ to, subject, html: signupCollisionHtml(to), text });
}

// -----------------------------------------------------------------------
// Account created email (welcome / verification success)
// -----------------------------------------------------------------------

/**
 * Welcome email after the user verifies their signup. Confirms account is
 * live, mentions the welcome credit balance, and points to the dashboard
 * and tools. Sent once per account, immediately after markEmailVerified.
 */
export async function sendAccountCreatedEmail({ to, welcomeCredits = 10 }) {
  const subject = 'Welcome to Trovarcis Reach';

  const text = [
    'Your Trovarcis Reach account is ready.',
    '',
    `We added ${welcomeCredits} free credits to your account so you can start verifying right away.`,
    '',
    'What to do next:',
    '  Open your dashboard:   https://trovarci.sh/dashboard',
    '  Score an email:        https://trovarci.sh/score',
    '  Verify a phone number: https://trovarci.sh/verify-number',
    '  Check a domain:        https://trovarci.sh/domain',
    '',
    'Need help? Reply to this email and we will get back to you.',
    '',
    '-- Trovarcis',
    'https://trovarci.sh',
  ].join('\n');

  return send({ to, subject, html: accountCreatedHtml(welcomeCredits), text });
}

// -----------------------------------------------------------------------
// Password changed email (security notification)
// -----------------------------------------------------------------------

/**
 * Confirmation email after a password reset succeeds. Standard security
 * practice: tell the user their password changed so they can act if it
 * was not them. Sent immediately after updatePassword + revokeAllSessions
 * in the reset-password action.
 */
export async function sendPasswordChangedEmail({ to }) {
  const subject = 'Your Trovarcis password was changed';

  const text = [
    'Your Trovarcis Reach password was just changed.',
    '',
    'For your security, all other active sessions on your account were also',
    'signed out. You will need to sign in again on any other devices.',
    '',
    'If this was you, no further action is needed.',
    '',
    'If this was NOT you, your account may be compromised. Reset your',
    'password immediately and contact support:',
    '  https://trovarci.sh/forgot-password',
    '',
    '-- Trovarcis',
    'https://trovarci.sh',
  ].join('\n');

  return send({ to, subject, html: passwordChangedHtml(), text });
}

// -----------------------------------------------------------------------
// HTML templates
// -----------------------------------------------------------------------

function verificationCodeHtml(code) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verify your Trovarcis account</title>
</head>
<body style="margin:0;padding:0;background:#09090B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#FAFAFA;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;">
  <tr>
    <td align="center" style="padding:48px 24px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131316;border:1px solid #27272A;border-radius:16px;">
        <tr>
          <td style="padding:40px 40px 24px 40px;">
            <div style="font-family:'Anybody',sans-serif;font-weight:900;font-size:22px;letter-spacing:-0.02em;color:#FAFAFA;">
              Trovar<span style="color:#D4A843;">cis</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 8px 40px;">
            <h1 style="margin:0;font-family:'Anybody',sans-serif;font-weight:700;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:#FAFAFA;">
              Verify your email
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 0 40px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#A1A1AA;">
              Enter this code to finish creating your account. It expires in 15 minutes.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <div style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-weight:600;font-size:36px;letter-spacing:0.4em;color:#D4A843;background:#09090B;border:1px solid #27272A;border-radius:10px;padding:24px;text-align:center;">
              ${code}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 40px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#52525B;">
              If you did not request this, you can ignore this email. No account will be created without verification.
            </p>
          </td>
        </tr>
      </table>
      <div style="margin-top:24px;font-size:12px;color:#52525B;">
        Trovarcis &middot; <a href="https://trovarci.sh" style="color:#52525B;text-decoration:underline;">trovarci.sh</a>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function passwordResetHtml(resetUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset your Trovarcis password</title>
</head>
<body style="margin:0;padding:0;background:#09090B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#FAFAFA;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;">
  <tr>
    <td align="center" style="padding:48px 24px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131316;border:1px solid #27272A;border-radius:16px;">
        <tr>
          <td style="padding:40px 40px 24px 40px;">
            <div style="font-family:'Anybody',sans-serif;font-weight:900;font-size:22px;letter-spacing:-0.02em;color:#FAFAFA;">
              Trovar<span style="color:#D4A843;">cis</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 8px 40px;">
            <h1 style="margin:0;font-family:'Anybody',sans-serif;font-weight:700;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:#FAFAFA;">
              Reset your password
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 0 40px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#A1A1AA;">
              We received a request to reset your Trovarcis password. Click the button below to choose a new one. This link expires in 1 hour and can only be used once.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:32px 40px;">
            <a href="${resetUrl}" style="display:inline-block;background:#D4A843;color:#09090B;font-family:'DM Sans',sans-serif;font-weight:600;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;">
              Reset password
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 16px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#52525B;">
              If the button does not work, copy and paste this link into your browser:
            </p>
            <p style="margin:8px 0 0 0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:#A1A1AA;word-break:break-all;">
              ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 40px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#52525B;">
              If you did not request a password reset, you can ignore this email. Your password will not be changed.
            </p>
          </td>
        </tr>
      </table>
      <div style="margin-top:24px;font-size:12px;color:#52525B;">
        Trovarcis &middot; <a href="https://trovarci.sh" style="color:#52525B;text-decoration:underline;">trovarci.sh</a>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function signupCollisionHtml(email) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trovarcis Reach signup attempt</title>
</head>
<body style="margin:0;padding:0;background:#09090B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#FAFAFA;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;">
  <tr>
    <td align="center" style="padding:48px 24px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131316;border:1px solid #27272A;border-radius:16px;">
        <tr>
          <td style="padding:40px 40px 24px 40px;">
            <div style="font-family:'Anybody',sans-serif;font-weight:900;font-size:22px;letter-spacing:-0.02em;color:#FAFAFA;">
              Trovar<span style="color:#D4A843;">cis</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 8px 40px;">
            <h1 style="margin:0;font-family:'Anybody',sans-serif;font-weight:700;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:#FAFAFA;">
              Account already exists
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 0 40px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#A1A1AA;">
              Someone tried to create a new Trovarcis Reach account using <strong style="color:#FAFAFA;">${email}</strong>. You already have an account with this email, so we did not create a new one.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;color:#FAFAFA;">
              If this was you:
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 40px;">
            <a href="https://trovarci.sh/login" style="display:inline-block;background:#D4A843;color:#09090B;font-family:'DM Sans',sans-serif;font-weight:600;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;">
              Sign in to your account
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 40px 24px 40px;">
            <a href="https://trovarci.sh/forgot-password" style="font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;color:#A1A1AA;text-decoration:underline;">
              Forgot your password? Reset it
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 40px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#52525B;">
              If this was not you, you can safely ignore this email. No changes were made to your account.
            </p>
          </td>
        </tr>
      </table>
      <div style="margin-top:24px;font-size:12px;color:#52525B;">
        Trovarcis &middot; <a href="https://trovarci.sh" style="color:#52525B;text-decoration:underline;">trovarci.sh</a>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function accountCreatedHtml(welcomeCredits) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to Trovarcis Reach</title>
</head>
<body style="margin:0;padding:0;background:#09090B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#FAFAFA;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;">
  <tr>
    <td align="center" style="padding:48px 24px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131316;border:1px solid #27272A;border-radius:16px;">
        <tr>
          <td style="padding:40px 40px 24px 40px;">
            <div style="font-family:'Anybody',sans-serif;font-weight:900;font-size:22px;letter-spacing:-0.02em;color:#FAFAFA;">
              Trovar<span style="color:#D4A843;">cis</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 8px 40px;">
            <h1 style="margin:0;font-family:'Anybody',sans-serif;font-weight:700;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:#FAFAFA;">
              Your account is ready
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 0 40px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#A1A1AA;">
              Welcome to Trovarcis Reach. Your email is verified and your account is active.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <div style="background:#09090B;border:1px solid rgba(212,168,67,0.25);border-radius:10px;padding:18px;text-align:center;">
              <div style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-weight:600;font-size:11px;letter-spacing:0.08em;color:#A1A1AA;text-transform:uppercase;">
                Welcome bonus
              </div>
              <div style="margin-top:6px;font-family:'Anybody',sans-serif;font-weight:700;font-size:28px;letter-spacing:-0.02em;color:#D4A843;">
                ${welcomeCredits} free credits
              </div>
              <div style="margin-top:4px;font-size:13px;line-height:1.5;color:#52525B;">
                Already added to your balance.
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 40px 8px 40px;">
            <a href="https://trovarci.sh/dashboard" style="display:inline-block;background:#D4A843;color:#09090B;font-family:'DM Sans',sans-serif;font-weight:600;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;">
              Open Dashboard
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <p style="margin:0 0 12px 0;font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.08em;color:#52525B;text-transform:uppercase;">
              Or try a tool
            </p>
            <ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.7;color:#A1A1AA;">
              <li><a href="https://trovarci.sh/score" style="color:#D4A843;text-decoration:none;">Score an email</a></li>
              <li><a href="https://trovarci.sh/verify-number" style="color:#D4A843;text-decoration:none;">Verify a phone number</a></li>
              <li><a href="https://trovarci.sh/domain" style="color:#D4A843;text-decoration:none;">Check a domain</a></li>
            </ul>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 40px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#52525B;">
              Reply to this email if you need a hand. We read every message.
            </p>
          </td>
        </tr>
      </table>
      <div style="margin-top:24px;font-size:12px;color:#52525B;">
        Trovarcis &middot; <a href="https://trovarci.sh" style="color:#52525B;text-decoration:underline;">trovarci.sh</a>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function passwordChangedHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Trovarcis password was changed</title>
</head>
<body style="margin:0;padding:0;background:#09090B;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#FAFAFA;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;">
  <tr>
    <td align="center" style="padding:48px 24px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131316;border:1px solid #27272A;border-radius:16px;">
        <tr>
          <td style="padding:40px 40px 24px 40px;">
            <div style="font-family:'Anybody',sans-serif;font-weight:900;font-size:22px;letter-spacing:-0.02em;color:#FAFAFA;">
              Trovar<span style="color:#D4A843;">cis</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 8px 40px;">
            <h1 style="margin:0;font-family:'Anybody',sans-serif;font-weight:700;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:#FAFAFA;">
              Password updated
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 0 40px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#A1A1AA;">
              Your Trovarcis Reach password was just changed. For your security, all other active sessions on your account were also signed out.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <div style="background:#09090B;border:1px solid rgba(52,211,153,0.25);border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:12px;">
              <div style="display:inline-block;width:24px;height:24px;border-radius:50%;background:rgba(52,211,153,0.15);text-align:center;line-height:24px;color:#34D399;font-weight:800;font-size:14px;">&#x2713;</div>
              <div style="font-size:14px;color:#34D399;font-weight:600;">
                If this was you, no further action is needed.
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 0 40px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#A1A1AA;">
              <strong style="color:#FAFAFA;">If this was not you</strong>, your account may be at risk. Reset your password immediately and review your recent activity.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 40px 0 40px;">
            <a href="https://trovarci.sh/forgot-password" style="display:inline-block;background:transparent;color:#FAFAFA;border:1.5px solid #27272A;font-family:'DM Sans',sans-serif;font-weight:600;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">
              Secure my account
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 40px 40px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#52525B;">
              For unexpected changes, reply to this email and we will help.
            </p>
          </td>
        </tr>
      </table>
      <div style="margin-top:24px;font-size:12px;color:#52525B;">
        Trovarcis &middot; <a href="https://trovarci.sh" style="color:#52525B;text-decoration:underline;">trovarci.sh</a>
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}
