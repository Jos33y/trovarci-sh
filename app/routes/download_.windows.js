// GET /download/windows - redirects to the newest installer named in the update feed.

import { getLatestRelease } from '~/lib/updateFeed.server';

export async function loader() {
  const release = await getLatestRelease();
  if (!release) {
    return new Response('The download is being updated. Try again in a minute, or write to support@trovarcis.com.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: `/updates/${release.path}`, 'Cache-Control': 'no-store' },
  });
}
