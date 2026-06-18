/* ═══════════════════════════════════════════════════════════════════════════
   scoreCache.server.js

   Two production-grade caches for the email scorer:

     1. INFLIGHT MAP - request-level idempotency, keyed on (userId, idempotencyKey).
        If two requests arrive with the same key within IDEMPOTENCY_TTL_MS,
        the second WAITS on the first's promise. Prevents double-charge from
        accidental client retries (double-click, network blip during fetch).

     2. RESULT CACHE - content-level dedup, keyed on (userId, hash(input)).
        If a user scores the SAME email twice within RESULT_TTL_MS, the
        second call returns the cached result without spending a credit
        or hitting Anthropic. This stops the cheapest gaming vector
        (paste-same-email-twice for free reads).

   Why in-memory and not Redis:
     - Single Node process today. Worker is separate but doesn't score.
     - Map operations are O(1) and stay in single-digit microseconds.
     - At 100KB max input + ~5KB result, 10k entries = ~1GB worst case,
       but in practice dedup makes total memory <100MB.
     - When we add a second app process behind a load balancer, swap the
       Map for an `ioredis` client - the get/set surface here is small
       enough to swap with one PR. Document that here so future-you knows.

   Eviction policy:
     - Time-based: every entry has expiresAt; reads prune expired.
     - Size-based: when MAX_ENTRIES is hit, the oldest 20% are evicted.
       O(n) sweep is fine because it runs once per ~1000 inserts.

   Hash function for content keys:
     - SHA-256 truncated to 16 bytes hex (32 chars). Collision risk for
       same user within 1hr is astronomically low. Built-in crypto, no
       extra deps.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createHash } from 'node:crypto';

const IDEMPOTENCY_TTL_MS = 60_000;        // 1 minute - covers retries, not real "I want to re-score"
const RESULT_TTL_MS      = 60 * 60_000;   // 1 hour - same email twice in 1hr = cached
const MAX_ENTRIES        = 10_000;        // soft cap before LRU sweep

const _inflight = new Map();   // key -> Promise<scoreResult>
const _results  = new Map();   // key -> { result, expiresAt }

let _opsSinceLastSweep = 0;
const SWEEP_INTERVAL_OPS = 1000;

/**
 * Stable content hash. Order-independent for the inputs we care about.
 * Different mode + same body = different hash (correct - simple/full
 * mode have different prompts and produce different scores).
 */
export function hashScoringInput(input) {
  const h = createHash('sha256');
  h.update(String(input.mode || ''));
  h.update('\x00');
  h.update(String(input.subject || ''));
  h.update('\x00');
  h.update(String(input.body || ''));
  return h.digest('hex').slice(0, 32);
}

/**
 * Idempotency check. If a request with the same key is already in flight
 * for this user, return its promise. Otherwise register the new promise
 * and return null so the caller proceeds.
 *
 * Usage:
 *   const existing = checkIdempotency(userId, key);
 *   if (existing) return await existing;
 *   const promise = doTheWork();
 *   registerInflight(userId, key, promise);
 *   return await promise;
 */
export function checkIdempotency(userId, idempotencyKey) {
  if (!idempotencyKey) return null;
  maybeSweep();
  const k = `${userId}:${idempotencyKey}`;
  const entry = _inflight.get(k);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    _inflight.delete(k);
    return null;
  }
  return entry.promise;
}

export function registerInflight(userId, idempotencyKey, promise) {
  if (!idempotencyKey) return;
  const k = `${userId}:${idempotencyKey}`;
  _inflight.set(k, {
    promise,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
  // Auto-evict on settle so successful keys don't linger forever.
  promise.finally(() => {
    setTimeout(() => _inflight.delete(k), IDEMPOTENCY_TTL_MS);
  });
}

/**
 * Result cache. Returns the cached scoreEmail result for this user+input
 * if one exists and hasn't expired. The route should treat a cache hit
 * as "do not spend credits, do not call Anthropic, return this".
 */
export function checkResultCache(userId, contentHash) {
  if (!contentHash) return null;
  maybeSweep();
  const k = `${userId}:${contentHash}`;
  const entry = _results.get(k);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    _results.delete(k);
    return null;
  }
  return entry.result;
}

export function setResultCache(userId, contentHash, result) {
  if (!contentHash) return;
  const k = `${userId}:${contentHash}`;
  _results.set(k, {
    result,
    expiresAt: Date.now() + RESULT_TTL_MS,
  });
}

/**
 * Periodic eviction. Runs once per SWEEP_INTERVAL_OPS map operations
 * to amortize the cost. Removes expired entries first; if still over
 * MAX_ENTRIES, removes the oldest 20% by expiresAt.
 */
function maybeSweep() {
  _opsSinceLastSweep++;
  if (_opsSinceLastSweep < SWEEP_INTERVAL_OPS) return;
  _opsSinceLastSweep = 0;

  const now = Date.now();
  for (const [k, v] of _inflight) if (v.expiresAt < now) _inflight.delete(k);
  for (const [k, v] of _results)  if (v.expiresAt < now) _results.delete(k);

  if (_results.size > MAX_ENTRIES) {
    const sorted = Array.from(_results.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const evictCount = Math.ceil(sorted.length * 0.2);
    for (let i = 0; i < evictCount; i++) _results.delete(sorted[i][0]);
  }
}

/**
 * Diagnostic - the worker health endpoint can call this for visibility.
 * Not used by the request path.
 */
export function getCacheStats() {
  return {
    inflight: _inflight.size,
    results: _results.size,
    opsSinceLastSweep: _opsSinceLastSweep,
  };
}
