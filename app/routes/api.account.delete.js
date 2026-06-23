// POST /api/account/delete - soft delete current user. Requires confirm:'DELETE' in body. Clears session cookie.

import { requireUser, clearSessionCookie, revokeAllUserSessions } from '~/utils/session.server';
import { softDeleteUser } from '~/lib/account.server';

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  try {
    const user = await requireUser(request);

    let body;
    try { body = await request.json(); }
    catch { body = {}; }

    if (body?.confirm !== 'DELETE') {
      return Response.json(
        { ok: false, code: 'BAD_CONFIRM', error: 'Type DELETE to confirm account deletion.' },
        { status: 400 },
      );
    }

    if (user.role === 'admin') {
      return Response.json(
        { ok: false, code: 'ADMIN_CANNOT_DELETE', error: 'Admin accounts cannot self-delete. Demote first.' },
        { status: 403 },
      );
    }

    const result = await softDeleteUser(user.id);
    await revokeAllUserSessions(user.id);

    return Response.json(
      { ok: true, alreadyDeleted: result.alreadyDeleted },
      { headers: { 'Set-Cookie': clearSessionCookie() } },
    );

  } catch (err) {
    console.error('[account delete] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Could not delete account' },
      { status: 500 },
    );
  }
}
