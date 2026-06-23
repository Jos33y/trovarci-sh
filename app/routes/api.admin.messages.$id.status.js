// POST /api/admin/messages/:id/status - update status (new|read|replied|spam) + optional notes. Audit-logged.

import { requireAdmin, adminUpdateContactMessageStatus } from '~/utils/admin.server';
import { logAdminAction } from '~/utils/adminActions.server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID = new Set(['new', 'read', 'replied', 'spam']);

export async function action({ request, params }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  try {
    const admin = await requireAdmin(request);

    if (!UUID_RE.test(params.id)) {
      return Response.json({ ok: false, code: 'BAD_ID', error: 'Invalid message id' }, { status: 400 });
    }

    let body;
    try { body = await request.json(); }
    catch { body = {}; }

    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    const notes  = typeof body?.notes  === 'string' ? body.notes.trim()  : '';

    if (!VALID.has(status)) {
      return Response.json({ ok: false, code: 'BAD_STATUS', error: 'Status must be new, read, replied, or spam' }, { status: 400 });
    }
    if (notes.length > 1000) {
      return Response.json({ ok: false, code: 'NOTES_TOO_LONG', error: 'Notes must be 1000 chars or fewer' }, { status: 400 });
    }

    // Audit log before mutation so the row exists even if the update fails.
    await logAdminAction(null, {
      actorId:    admin.id,
      actionType: 'contact_message_status_change',
      targetKind: 'contact_message',
      targetId:   params.id,
      reason:     `Status -> ${status}`,
      context:    { status, has_notes: notes.length > 0 },
    });

    const updated = await adminUpdateContactMessageStatus(params.id, {
      status,
      notes: notes || null,
    });

    return Response.json({ ok: true, message: updated });
  } catch (err) {
    console.error('[admin message status] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Could not update status' },
      { status: 500 },
    );
  }
}
