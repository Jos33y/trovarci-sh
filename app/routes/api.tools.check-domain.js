/* /api/tools/check-domain - Domain Health Checker. Anonymous, IP-rate-limited (60/hour). */

import { runDomainCheck } from '~/utils/domainChecks.server';
import { recordToolEvent } from '~/utils/toolAnalytics.server';

const ANALYTICS_TOOL = 'domain_check';

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_HITS  = 60;

const ipBuckets = new Map();
const CLEAN_INTERVAL_MS = 5 * 60 * 1000;
let lastGlobalClean = Date.now();

function rateLimit(ip) {
  if (!ip) return { allowed: true, retryAfter: null };

  const now = Date.now();

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

  const cutoff = now - RATE_WINDOW_MS;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= RATE_MAX_HITS) {
    const freesAt = bucket.hits[0] + RATE_WINDOW_MS;
    const retryAfter = Math.max(1, Math.ceil((freesAt - now) / 1000));
    return { allowed: false, retryAfter };
  }

  bucket.hits.push(now);
  return { allowed: true, retryAfter: null };
}

function getClientIp(request) {
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
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'RATE_LIMITED' });
    return Response.json(
      { ok: false, error: 'Too many domain checks. Try again shortly.' },
      {
        status: 429,
        headers: rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {},
      }
    );
  }

  recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'start' });

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
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'BAD_REQUEST' });
    return Response.json(
      { ok: false, error: 'Could not parse request body' },
      { status: 400 }
    );
  }

  if (!domain || typeof domain !== 'string') {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'MISSING_DOMAIN' });
    return Response.json(
      { ok: false, error: 'Missing domain' },
      { status: 400 }
    );
  }

  try {
    const outcome = await runDomainCheck(domain);
    if (!outcome.ok) {
      recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'CHECK_FAILED' });
      return Response.json(
        { ok: false, error: outcome.error },
        { status: 400 }
      );
    }
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'success' });
    return Response.json({ ok: true, result: outcome.result });
  } catch (err) {
    console.error('Domain check failed:', err);
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'INTERNAL' });
    return Response.json(
      { ok: false, error: 'Scan failed unexpectedly. Try again in a moment.' },
      { status: 500 }
    );
  }
}

export function loader() {
  return Response.json(
    { ok: false, error: 'Use POST' },
    { status: 405 }
  );
}
