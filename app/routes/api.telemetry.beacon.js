/**
 * POST /api/telemetry/beacon
 *
 * Single client beacon endpoint. Accepts:
 *   { type: 'pageview', path, referrer, utm: {...} }
 *   { type: 'error', kind, severity, message, stack, path, line, column, context }
 *   { type: 'event',  eventType, path, metadata }   // for explicit funnel pings
 *
 * Always returns 204 No Content (or 400 on shape error). The client uses
 * navigator.sendBeacon which doesn't read the body anyway; we keep status
 * codes meaningful for testing.
 *
 * Body parsing:
 *   navigator.sendBeacon sends with Content-Type: text/plain;charset=UTF-8
 *   when given a string, or application/json when given a Blob with that
 *   type. We accept either; await request.text() and JSON.parse.
 *
 * Rate limit: per-session-hash, 200/hour. Generous - a heavy SPA could
 * legitimately fire ~100 beacons/hour on intense use; bots are filtered
 * upstream by the bot check in deriveSessionHash.
 *
 * Auth: optional. If the request has a session cookie we attribute the
 * event to the user; otherwise it's anonymous (session_hash only).
 */

import { getOptionalUser } from '~/utils/session.server';
import {
  recordEvent,
  buildEventFromRequest,
  deriveSessionHash,
} from '~/utils/analytics.server';
import { recordClientError } from '~/utils/errors.server';
import { isbot } from 'isbot';

// Per-process in-memory rate limit. Keeps the DB out of the hot path for
// the beacon endpoint (high frequency, low value per request).
const RL_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const RL_MAX_HITS  = 200;
const buckets = new Map();
let lastGc = Date.now();
const GC_INTERVAL_MS = 5 * 60 * 1000;

function rateLimitOk(key) {
  const now = Date.now();
  if (now - lastGc > GC_INTERVAL_MS) {
    const cutoff = now - RL_WINDOW_MS;
    for (const [k, v] of buckets) {
      if (v.length === 0 || v[v.length - 1] < cutoff) buckets.delete(k);
    }
    lastGc = now;
  }
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  const cutoff = now - RL_WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();
  if (arr.length >= RL_MAX_HITS) return false;
  arr.push(now);
  return true;
}

export async function loader() {
  return new Response(null, { status: 405 });
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  // Bot-tagged sessions get silently dropped before any work.
  const ua = request.headers.get('user-agent') || '';
  if (isbot(ua)) return new Response(null, { status: 204 });

  const sessionHash = deriveSessionHash(request);
  if (!rateLimitOk(sessionHash)) {
    return new Response(null, { status: 204 }); // silent drop
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!raw || raw.length > 16_384) {
    // sendBeacon caps at 64KB but we cap tighter; legitimate beacons
    // are small (<1KB).
    return new Response(null, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const user = await getOptionalUser(request);
  const userId = user?.id ?? null;

  const type = payload?.type;
  if (type === 'pageview') {
    const path = typeof payload.path === 'string' ? payload.path.slice(0, 512) : null;
    if (!path) return new Response(null, { status: 400 });

    // Reject framework / browser probe paths that are not real pageviews.
    // The client-side telemetry IIFE already skips these but we double-up
    // here so a misbehaving client (or a forged beacon) cannot pollute
    // the analytics_events table.
    if (path.startsWith('/.well-known/')) return new Response(null, { status: 204 });
    if (path.startsWith('/__'))            return new Response(null, { status: 204 });
    if (path.startsWith('/api/'))          return new Response(null, { status: 204 });
    if (path.endsWith('.data'))            return new Response(null, { status: 204 });

    const event = buildEventFromRequest(request, {
      eventType: 'pageview',
      path,
      userId,
      metadata: {
        client_referrer: typeof payload.referrer === 'string' ? payload.referrer.slice(0, 512) : null,
      },
    });
    recordEvent(event);
    return new Response(null, { status: 204 });
  }

  if (type === 'event') {
    const eventType = typeof payload.eventType === 'string' ? payload.eventType.slice(0, 64) : null;
    if (!eventType) return new Response(null, { status: 400 });
    // Defence: don't let the client mint server-side event types. Allowlist
    // the client-fireable types.
    const CLIENT_ALLOWED = new Set([
      'click_outbound', 'click_internal_cta', 'tool_form_focus',
      'package_select', 'checkout_click', 'credits_view',
      'video_play', 'video_complete', 'scroll_depth_50', 'scroll_depth_90',
    ]);
    if (!CLIENT_ALLOWED.has(eventType)) return new Response(null, { status: 400 });

    const event = buildEventFromRequest(request, {
      eventType,
      path: typeof payload.path === 'string' ? payload.path.slice(0, 512) : null,
      userId,
      metadata: typeof payload.metadata === 'object' && payload.metadata
        ? sanitiseMetadata(payload.metadata)
        : {},
    });
    recordEvent(event);
    return new Response(null, { status: 204 });
  }

  if (type === 'error') {
    await recordClientError(payload, request, userId);
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 400 });
}

function sanitiseMetadata(obj) {
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (count++ >= 20) break;
    if (typeof k !== 'string' || k.length > 64) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 256);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    // Drop nested objects from client metadata - keeps the surface small
    // and analysable. Server-side recordEvent calls can use richer shapes.
  }
  return out;
}
