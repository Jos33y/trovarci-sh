// POST /api/account/change-password - authenticated password change. Sends a notification email and signs out other sessions.

import { getSessionFromRequest, revokeOtherSessionsForUser } from '~/utils/session.server';
import { changePassword } from '~/utils/auth.server';
import { sendPasswordChangedEmail } from '~/utils/email.server';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

export async function loader() {
  return new Response('Method not allowed', { status: 405 });
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const session = await getSessionFromRequest(request);
  if (!session) {
    return json({ ok: false, error: 'Not signed in' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword     = typeof body?.newPassword === 'string'     ? body.newPassword     : '';

  if (!currentPassword) {
    return json({ ok: false, error: 'Enter your current password' }, 400);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    return json({ ok: false, error: `New password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters` }, 400);
  }
  if (newPassword === currentPassword) {
    return json({ ok: false, error: 'New password must be different from current' }, 400);
  }

  const result = await changePassword({
    userId: session.user.id,
    currentPassword,
    newPassword,
  });
  if (!result.ok) {
    if (result.reason === 'wrong_password') {
      return json({ ok: false, error: 'Current password is incorrect' }, 401);
    }
    return json({ ok: false, error: 'Could not change password' }, 500);
  }

  // Sign out everywhere else. The current session stays valid so the user is
  // not bounced back to the login screen mid-flow.
  await revokeOtherSessionsForUser(session.user.id, session.sessionId);

  // Fire-and-log the notification email. Reset-flow already uses this template.
  sendPasswordChangedEmail({ to: session.user.email }).catch((err) =>
    console.error('[change-password] notification email failed:', err.message),
  );

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
