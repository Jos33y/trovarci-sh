// POST /api/admin/errors/:id/resolve - JSON endpoint for the inline drawer. Returns {ok:true} on success.

import { requireAdmin, adminMarkErrorResolved } from '~/utils/admin.server';

export async function action({ request, params }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  try {
    const admin = await requireAdmin(request);
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return Response.json({ ok: false, code: 'BAD_ID', error: 'Invalid error id' }, { status: 400 });
    }

    let body;
    try { body = await request.json(); }
    catch { body = {}; }

    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) {
      return Response.json({ ok: false, code: 'NOTE_TOO_LONG', error: 'Note must be 500 chars or fewer' }, { status: 400 });
    }

    await adminMarkErrorResolved(id, { actorId: admin.id, note: note || null });
    return Response.json({ ok: true });

  } catch (err) {
    console.error('[admin resolve] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Could not mark resolved' },
      { status: 500 },
    );
  }
}
