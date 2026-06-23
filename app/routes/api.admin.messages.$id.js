// GET /api/admin/messages/:id - JSON detail for the inline drawer. Admin-only.

import { requireAdmin, adminGetContactMessage } from '~/utils/admin.server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request, params }) {
  try {
    await requireAdmin(request);

    if (!UUID_RE.test(params.id)) {
      return Response.json({ ok: false, code: 'BAD_ID', error: 'Invalid message id' }, { status: 400 });
    }

    const message = await adminGetContactMessage(params.id);
    if (!message) {
      return Response.json({ ok: false, code: 'NOT_FOUND', error: 'Message not found' }, { status: 404 });
    }

    return Response.json({ ok: true, message });
  } catch (err) {
    console.error('[admin message detail] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Could not load message' },
      { status: 500 },
    );
  }
}
