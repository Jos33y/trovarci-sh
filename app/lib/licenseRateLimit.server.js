// Per-IP token bucket for the unauthenticated license endpoints.
//
// These routes take a bearer credential and report whether it is real, which is an
// oracle for testing stolen or guessed keys. In-memory and per-process, same trade
// as the Cryptomus webhook bucket: cross-process coordination costs more than it
// is worth until well past the first thousand customers.

const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 60;
const GC_INTERVAL_MS = 5 * 60 * 1000;

const buckets = new Map();
let lastGcAt = Date.now();

export function getClientIp(request) {
  // Coolify fronts the app, so x-forwarded-for is authoritative. Leftmost is the
  // original client per RFC 7239.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

export function licenseRateLimit(ip) {
  if (!ip) return { allowed: true, retryAfter: null };

  const now = Date.now();

  if (now - lastGcAt > GC_INTERVAL_MS) {
    const cutoff = now - WINDOW_MS;
    for (const [k, v] of buckets) {
      if (v.length === 0 || v[v.length - 1] < cutoff) buckets.delete(k);
    }
    lastGcAt = now;
  }

  const cutoff = now - WINDOW_MS;
  const hits = (buckets.get(ip) || []).filter((t) => t > cutoff);

  if (hits.length >= MAX_HITS) {
    const retryAfter = Math.max(1, Math.ceil((hits[0] + WINDOW_MS - now) / 1000));
    buckets.set(ip, hits);
    return { allowed: false, retryAfter };
  }

  hits.push(now);
  buckets.set(ip, hits);
  return { allowed: true, retryAfter: null };
}
