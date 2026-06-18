/**
 * POST /api/waitlist
 *
 * Body: { email: string, source: 'download_page' | 'dashboard_panel' }
 * Returns 200 { ok: true } whether the email is new or already on the list -
 *   we never reveal "you're already signed up", which would let an attacker
 *   enumerate which addresses have signed up.
 *
 * Auth: not required. Logged-in users carry their user_id implicitly via the
 *   session cookie; anon users on /download submit without one.
 *
 * Rate limit: 10 submissions per IP per minute. In-process token bucket.
 *   This is per-process, not distributed, but the worst case (multi-node
 *   deployment lets an attacker get 10*N) is still limited and benign for
 *   a non-financial endpoint.
 */

import { addToWaitlist } from '~/lib/waitlist.server';
import { getOptionalUser } from '~/utils/session.server';

const RATE_WINDOW_MS  = 60_000;
const RATE_MAX_HITS   = 10;

// Map<ip, { hits: number[], lastClean: number }>
// hits is a list of unix-ms timestamps within the rolling window.
const ipBuckets = new Map();
const CLEAN_INTERVAL_MS = 5 * 60_000;
let lastGlobalClean = Date.now();

function rateLimit(ip) {
  if (!ip) return true; // no IP visible -> can't rate limit, allow

  const now = Date.now();

  // Periodic global GC so the Map doesn't grow unbounded with one-shot IPs.
  if (now - lastGlobalClean > CLEAN_INTERVAL_MS) {
    for (const [k, v] of ipBuckets) {
      if (v.hits.length === 0 || v.hits[v.hits.length - 1] < now - RATE_WINDOW_MS) {
        ipBuckets.delete(k);
      }
    }
    lastGlobalClean = now;
  }

  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { hits: [] };
    ipBuckets.set(ip, bucket);
  }

  // Drop hits older than the window.
  const cutoff = now - RATE_WINDOW_MS;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= RATE_MAX_HITS) return false;
  bucket.hits.push(now);
  return true;
}

function getClientIp(request) {
  // Coolify / nginx fronts the app, so X-Forwarded-For is authoritative.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return Response.json({ ok: false, error: 'Too many requests' }, { status: 429 });
  }

  // Accept JSON or form-encoded; the dashboard fetcher posts FormData,
  // and external callers might send JSON.
  let email, source;
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      email  = body.email;
      source = body.source;
    } else {
      const form = await request.formData();
      email  = form.get('email');
      source = form.get('source');
    }
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  // Pull user_id from the session cookie if signed in, but don't require it.
  const user = await getOptionalUser(request);
  const userAgent = request.headers.get('user-agent');

  const result = await addToWaitlist(email, {
    source,
    userId:    user?.id ?? null,
    userAgent,
    ipAddress: ip,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Always return ok: true regardless of alreadyOnList. The dashboard panel
  // renders its success state from the loader's onWaitlist boolean, not
  // this response, so we don't lose anything by hiding alreadyOnList here.
  return Response.json({ ok: true });
}

// GET on this route is meaningless; return 405 instead of leaking the
// route to scrapers that probe HEAD / GET.
export function loader() {
  return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}
