// GET /download/windows - redirects to the newest installer named in the update feed, and counts the download.

import { getLatestRelease } from '~/lib/updateFeed.server';
import { getOptionalUser } from '~/utils/session.server';
import { recordEvent, buildEventFromRequest } from '~/utils/analytics.server';

export async function loader({ request }) {
  const release = await getLatestRelease();
  if (!release) {
    return new Response('The download is being updated. Try again in a minute, or write to support@trovarcis.com.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }

  // Counted here because the installer itself is served by the update feed, outside the app.
  if (request.method === 'GET') {
    try {
      const user = await getOptionalUser(request);
      recordEvent(buildEventFromRequest(request, {
        eventType: 'sender_download',
        path: '/download/windows',
        userId: user?.id ?? null,
        metadata: { version: release.version },
      }));
    } catch { /* a failed count never blocks the download */ }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `/updates/${release.path}`, 'Cache-Control': 'no-store' },
  });
}
