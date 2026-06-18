/* ═══════════════════════════════════════════════════════════════════════════
   /api/tools/check-domain

   Remix resource route. Accepts a POST with a domain, runs the full
   domain health check server-side, returns JSON.

   Rate limiting (P0-14):
     Per-IP token bucket, 60 hits per hour. The Domain Checker does live
     DNSBL queries against Spamhaus, SURBL, and several other blocklists.
     If anonymous abuse from a botnet hits this endpoint hard, our server
     IP gets banned by Spamhaus and EVERY legit user's check fails until
     we get unlisted (which takes 24-72h and a written request).
     60/hour is generous for human use (one scan per minute, sustained)
     and tight enough to make scripted abuse painful.

     In-memory bucket. Per-process, not distributed. Multi-node deployment
     would let an attacker get 60*N before being throttled, but the
     downside there is bounded and not catastrophic - upgrade to Redis or
     the auth_rate_limits table if scale demands.

   Session 1 notes (still valid):
   - No caching. Repeated scans of the same domain re-query everything.
     Adding a 5-minute in-memory TTL cache here is the cheapest win when
     traffic warrants it.
   - No DQS/paid API keys. Spamhaus public queries are rate-limited; for
     commercial use the DQS subscription is required.
   ═══════════════════════════════════════════════════════════════════════════ */

import { runDomainCheck } from '~/utils/domainChecks.server';

// ── Rate limit ──────────────────────────────────────────────────────────
const RATE_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const RATE_MAX_HITS  = 60;

// Map<ip, { hits: number[] }>. hits is a list of unix-ms timestamps within
// the rolling window.
const ipBuckets = new Map();
const CLEAN_INTERVAL_MS = 5 * 60 * 1000;
let lastGlobalClean = Date.now();

function rateLimit(ip) {
  if (!ip) return { allowed: true, retryAfter: null };  // no IP visible -> can't rate limit, allow

  const now = Date.now();

  // Periodic GC so the Map doesn't grow unbounded with one-shot IPs.
  if (now - lastGlobalClean > CLEAN_INTERVAL_MS) {
    const cutoff = now - RATE_WINDOW_MS;
    for (const [k, v] of ipBuckets) {
      if (v.hits.length === 0 || v.hits[v.hits.length - 1] < cutoff) {
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

  if (bucket.hits.length >= RATE_MAX_HITS) {
    // The oldest hit in the window falls off RATE_WINDOW_MS after it was
    // recorded; that's when the next slot frees up.
    const freesAt = bucket.hits[0] + RATE_WINDOW_MS;
    const retryAfter = Math.max(1, Math.ceil((freesAt - now) / 1000));
    return { allowed: false, retryAfter };
  }

  bucket.hits.push(now);
  return { allowed: true, retryAfter: null };
}

function getClientIp(request) {
  // Coolify / nginx fronts the app, so X-Forwarded-For is authoritative.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json(
      { ok: false, error: 'Method not allowed' },
      { status: 405 }
    );
  }

  const ip = getClientIp(request);
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: 'Too many domain checks. Try again shortly.' },
      {
        status: 429,
        headers: rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {},
      }
    );
  }

  let domain = '';
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      domain = typeof body.domain === 'string' ? body.domain : '';
    } else {
      const form = await request.formData();
      domain = form.get('domain') || '';
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: 'Could not parse request body' },
      { status: 400 }
    );
  }

  if (!domain || typeof domain !== 'string') {
    return Response.json(
      { ok: false, error: 'Missing domain' },
      { status: 400 }
    );
  }

  try {
    const outcome = await runDomainCheck(domain);
    if (!outcome.ok) {
      return Response.json(
        { ok: false, error: outcome.error },
        { status: 400 }
      );
    }
    return Response.json({ ok: true, result: outcome.result });
  } catch (err) {
    // Surface a generic message to the client; log the full error server-side.
    console.error('Domain check failed:', err);
    return Response.json(
      { ok: false, error: 'Scan failed unexpectedly. Try again in a moment.' },
      { status: 500 }
    );
  }
}

// Block GETs on the resource route so search engines and curious visitors
// do not get an empty 200.
export function loader() {
  return Response.json(
    { ok: false, error: 'Use POST' },
    { status: 405 }
  );
}
