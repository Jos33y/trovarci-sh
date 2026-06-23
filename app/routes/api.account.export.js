// GET /api/account/export - GDPR-style JSON download of all data we hold about the current user.

import { requireUser } from '~/utils/session.server';
import { buildUserDataExport } from '~/lib/account.server';

export async function loader({ request }) {
  try {
    const user = await requireUser(request);
    const data = await buildUserDataExport(user.id);
    const json = JSON.stringify(data, null, 2);

    const date     = new Date().toISOString().slice(0, 10);
    const filename = `trovarcis-data-${user.id.slice(0, 8)}-${date}.json`;

    return new Response(json, {
      headers: {
        'Content-Type':        'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store, private',
      },
    });
  } catch (err) {
    console.error('[account export] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: err?.message || 'Could not build export' },
      { status: 500 },
    );
  }
}
