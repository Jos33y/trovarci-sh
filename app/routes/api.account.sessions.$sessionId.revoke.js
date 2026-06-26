// POST /api/account/sessions/:sessionId/revoke - sign out one device. Scoped to the current user.

import { getSessionFromRequest, revokeSessionByIdForUser } from '~/utils/session.server';

export async function loader() {
  return new Response('Method not allowed', { status: 405 });
}

export async function action({ request, params }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const session = await getSessionFromRequest(request);
  if (!session) {
    return json({ ok: false, error: 'Not signed in' }, 401);
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ ok: false, error: 'Missing sessionId' }, 400);
  }

  // Refusing to revoke the current session prevents the obvious foot-gun.
  // Sign out is its own flow at /logout.
  if (sessionId === session.sessionId) {
    return json({ ok: false, error: 'Cannot revoke the current session here. Use sign out instead.' }, 400);
  }

  const affected = await revokeSessionByIdForUser(session.user.id, sessionId);
  if (affected === 0) {
    return json({ ok: false, error: 'Session not found' }, 404);
  }

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
