// /r/:code - an affiliate's link. Remembers the affiliate for 90 days (the last link clicked
// wins), counts the click, and sends the visitor on: to /sender, or to ?to=/some/page on this site.

import { redirect } from 'react-router';
import { getActiveAffiliateByCode, refCookie } from '~/lib/affiliates.server';
import { buildEventFromRequest, recordEvent } from '~/utils/analytics.server';

// Only a path on this site, so the link can never send anyone elsewhere.
function destination(request) {
  const to = new URL(request.url).searchParams.get('to') || '';
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(to) && !to.startsWith('/r/') ? to : '/sender';
}

export async function loader({ request, params }) {
  const code = String(params.code || '').toLowerCase();
  const to = destination(request);
  const affiliate = await getActiveAffiliateByCode(code).catch(() => null);
  if (!affiliate) throw redirect(to);

  recordEvent(buildEventFromRequest(request, {
    eventType: 'affiliate_click',
    path: `/r/${code}`,
    userId: null,
    referrer: request.headers.get('referer'),
    metadata: { code },
  }));

  throw redirect(to, { headers: { 'Set-Cookie': refCookie(code), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
