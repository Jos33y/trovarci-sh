/* ═══════════════════════════════════════════════════════════════════════════
   worker/health.js

   Minimal HTTP server for Coolify (and any other ops tooling) to verify
   the worker is alive and behaving. Returns JSON with uptime, counters,
   proxy health, and disposable list size.

   Endpoints:
     GET /          -> same as /health
     GET /health    -> { ok: true, uptimeSeconds, counters, proxy, ... }
     anything else  -> 404

   No auth. The worker runs on internal infrastructure (Coolify private
   network) and the health endpoint contains no secrets.

   The counters are best-effort, in-process. They reset on worker
   restart. If we want persistent throughput metrics we'll wire those
   to the database in a later batch.
   ═══════════════════════════════════════════════════════════════════════════ */

import http from 'node:http';
import { getHealth as getProxyHealth } from '../app/lib/proxyRotation.server.js';
import { getDisposableCount }           from '../app/lib/disposableDomains.server.js';

// Note: the listen port is read lazily inside startHealthServer() rather
// than captured here at module-load time. ESM imports are hoisted, so a
// caller that does `process.env.WORKER_HEALTH_PORT = '3099'; import * as
// health from '...';` would otherwise see the env var set AFTER this
// module's top-level code has already run, and the override would be
// silently ignored. Lazy read keeps the env var honoured.

const startedAt = Date.now();
let server = null;

const counters = {
  ticksWithWork:     0,
  ticksIdle:         0,
  itemsProcessed:    0,
  lastTickAt:        null,
  lastTickItemCount: 0,
};

/**
 * Called by the main loop after every claimItems call. Tracks throughput
 * even when no items were claimed (so we can distinguish "idle worker"
 * from "stuck worker" in the health output).
 */
export function recordTick(itemCount) {
  counters.lastTickAt        = new Date().toISOString();
  counters.lastTickItemCount = itemCount;
  if (itemCount > 0) counters.ticksWithWork++;
  else               counters.ticksIdle++;
}

/**
 * Called once per processed item (regardless of verdict). Counter is
 * useful for ops dashboards that want "items per minute" graphs.
 */
export function recordItemDone() {
  counters.itemsProcessed++;
}

function buildHealthPayload() {
  let proxyHealth;
  try { proxyHealth = getProxyHealth(); }
  catch (err) { proxyHealth = { error: err.message }; }

  let disposableCount;
  try { disposableCount = getDisposableCount(); }
  catch { disposableCount = 0; }

  return {
    ok:                  true,
    uptimeSeconds:       Math.floor((Date.now() - startedAt) / 1000),
    counters:            { ...counters },
    proxy:               proxyHealth,
    disposableListCount: disposableCount,
    pid:                 process.pid,
    nodeVersion:         process.version,
  };
}

export function startHealthServer() {
  const port = parseInt(process.env.WORKER_HEALTH_PORT || '3001', 10);

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (url === '/health' || url === '/') {
        const payload = buildHealthPayload();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload, null, 2));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.on('error', (err) => {
      console.error('[worker] health server error:', err.message);
      reject(err);
    });

    server.listen(port, () => {
      console.log(`[worker] health server listening on :${port}`);
      resolve();
    });
  });
}

export function stopHealthServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      console.log('[worker] health server closed');
      server = null;
      resolve();
    });
  });
}

/**
 * Test-only: build the payload without spinning up the HTTP server.
 * Used by scripts/verifyBatch03.mjs.
 */
export function _buildHealthPayloadForTests() {
  return buildHealthPayload();
}
