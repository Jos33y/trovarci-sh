// POST /api/telemetry/beacon - client pageview, event, and error capture.
// sendBeacon ignores response body; status codes kept meaningful for tests. Optional session attribution when signed in.

import { getOptionalUser } from '~/utils/session.server';
import {
  recordEvent,
  buildEventFromRequest,
  deriveSessionHash,
} from '~/utils/analytics.server';
import { recordClientError } from '~/utils/errors.server';
import { isbot } from 'isbot';

// Per-process in-memory rate limit: 200 hits per session-hash per hour. Keeps DB out of the beacon hot path.
const RL_WINDOW_MS = 60 * 60 * 1000;
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
    return new Response(null, { status: 204 });
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  // sendBeacon caps at 64KB; legitimate beacons are <1KB. Tighter cap here.
  if (!raw || raw.length > 16_384) {
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

    // Framework and browser probe paths - drop silently so a misbehaving or forged client cannot pollute analytics_events.
    if (path.startsWith('/.well-known/')) return new Response(null, { status: 204 });
    if (path.startsWith('/__'))            return new Response(null, { status: 204 });
    if (path.startsWith('/api/'))          return new Response(null, { status: 204 });
    if (path.endsWith('.data'))            return new Response(null, { status: 204 });

    // Admin routes and login redirects targeting admin - self-traffic noise, not real users.
    // path may include ?query so split before the exact-match check.
    const pathOnly = path.split('?')[0];
    if (pathOnly === '/admin' || pathOnly.startsWith('/admin/')) {
      return new Response(null, { status: 204 });
    }
    if (pathOnly === '/login' && (path.includes('redirectTo=%2Fadmin') || path.includes('redirectTo=/admin'))) {
      return new Response(null, { status: 204 });
    }

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
    // Allowlist client-fireable event types; server-side event names cannot be minted from the browser.
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

// Flatten shallow object: keep strings under 256 chars, drop nested objects. Cap at 20 keys.
function sanitiseMetadata(obj) {
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (count++ >= 20) break;
    if (typeof k !== 'string' || k.length > 64) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 256);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}
