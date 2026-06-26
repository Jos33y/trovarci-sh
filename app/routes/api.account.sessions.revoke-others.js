// POST /api/account/sessions/revoke-others - sign out everywhere except this device.

import { getSessionFromRequest, revokeOtherSessionsForUser } from '~/utils/session.server';

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

  const affected = await revokeOtherSessionsForUser(session.user.id, session.sessionId);
  return json({ ok: true, revoked: affected });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
