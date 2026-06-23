// GET /api/admin/errors/:id - JSON error detail for the inline drawer. Admin-only.

import { requireAdmin, adminGetErrorDetail } from '~/utils/admin.server';

export async function loader({ request, params }) {
  try {
    await requireAdmin(request);
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return Response.json({ ok: false, code: 'BAD_ID', error: 'Invalid error id' }, { status: 400 });
    }

    const error = await adminGetErrorDetail(id);
    if (!error) {
      return Response.json({ ok: false, code: 'NOT_FOUND', error: 'Error not found' }, { status: 404 });
    }

    return Response.json({ ok: true, error });
  } catch (err) {
    console.error('[admin error detail] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Could not load error' },
      { status: 500 },
    );
  }
}
