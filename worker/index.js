#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   worker/index.js

   Trovarcis Reach bulk verification worker. Standalone Node process,
   runs alongside the Remix app. Coolify launches this as a second
   service via `npm run worker:start`.

   Run dev:   node --env-file=.env worker/index.js
   Run prod:  node worker/index.js   (env from Coolify)

   Lifecycle:
     startup  -> assert required env, read config, start health server,
                 register signals, begin one main loop per supported
                 type (email, phone) plus the type-agnostic housekeeping
                 loops
     loops    -> mainLoop(type, processor, concurrency):
                                         claim batch of `type` items,
                                         process in parallel
                 stuckRecoveryLoop:      reset items abandoned by crashed
                                         workers (any type)
                 expiredCleanupLoop:     drop jobs past their retention TTL
     shutdown -> SIGTERM stops claiming, drains in-flight items,
                 closes health server, exits cleanly

   Concurrency model:
     Each type gets its own concurrency budget. The bottleneck differs
     by type so the budget should differ too:

       email:  IPRoyal SOCKS5 proxy + SMTP probes. Bandwidth-bound.
               Default 10 in-flight handles a 50k-row job comfortably.

       phone:  Twilio Lookup v2. API-bound, ~100 req/sec global account
               cap. Default 5 in-flight stays well under the ceiling
               and leaves headroom for the synchronous single-mode
               endpoint to use Twilio without competing with bulk.

     Both env-overridable. Drop phone concurrency to 2-3 if your Twilio
     account has reduced rate limits.

     Multiple workers can run safely against the same DB. The
     FOR UPDATE SKIP LOCKED claim query in jobQueue.claimItems means
     concurrent workers receive disjoint item sets. Scaling out is just
     spinning up another container.

   Why one main loop per type, not one shared loop:
     A shared loop with a unified claim across types would have email
     and phone fight for the same concurrency slots. A burst of phone
     work could starve email throughput (or vice versa). Separate loops
     give predictable per-type throughput regardless of mix. The
     overhead of two loops vs one is negligible (each tick is ~1ms when
     idle).

   Why the housekeeping loops stay shared:
     stuckRecoveryLoop and expiredCleanupLoop operate on rows
     regardless of type. Splitting them would add complexity for zero
     gain.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Boot-time env assertions ────────────────────────────────────────────
// Run BEFORE any other import that might silently degrade on missing config.
// The worker has no req-scoped fallback path; if VERIFICATION_CODE_PEPPER is
// missing we want the process to die at startup, not write half-pepperedhashes
// for an hour and then crash on first reset.
//
// DATABASE_URL is asserted by db.server.js when imported below; we rely on
// that and don't double-assert here.
{
  const pepper = process.env.VERIFICATION_CODE_PEPPER;
  if (!pepper || pepper.length < 32) {
    console.error(
      '[worker] FATAL: VERIFICATION_CODE_PEPPER must be set and at least 32 chars. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
    process.exit(1);
  }
  // Tag this process so analytics.server.js does not also start its
  // web-process flush timer (the worker has its own analyticsFlushLoop).
  process.env.IS_WORKER = 'true';
}

import {
  claimItems,
  findStuckItems,
  resetStuckItem,
  cleanupExpiredJobs,
} from '../app/lib/jobQueue.server.js';

import { runAuthCleanups } from '../app/utils/authCleanup.server.js';
import {
  flushAnalyticsBuffer,
  computeDailyRollup,
  cleanupOldAnalyticsEvents,
  ANALYTICS_FLUSH_INTERVAL_MS,
} from '../app/utils/analytics.server.js';
import { cleanupOldErrorEvents, recordWorkerError } from '../app/utils/errors.server.js';
import { expireCredits } from '../app/lib/creditExpiry.server.js';

import { processItem as processEmailItem } from './emailProcessor.js';
import { processItem as processPhoneItem } from './phoneProcessor.js';
import {
  startHealthServer,
  stopHealthServer,
  recordTick,
  recordItemDone,
} from './health.js';
import {
  registerShutdownHandlers,
  shutdownState,
  awaitInflight,
} from './lifecycle.js';

const POLL_INTERVAL_MS              = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000',   10);
const EMAIL_CONCURRENCY             = parseInt(process.env.WORKER_EMAIL_CONCURRENCY || process.env.WORKER_CONCURRENCY || '10', 10);
const PHONE_CONCURRENCY             = parseInt(process.env.WORKER_PHONE_CONCURRENCY || '5', 10);

// Stuck-item recovery. Items left in 'processing' state by a crashed/hard-
// killed prior worker need to be reset to 'pending' so the new worker can
// reclaim them. There's no risk of stepping on a healthy in-flight item
// because the new worker uses a different inflight Set; only DB rows are
// shared. Defaults tuned for production but env-tunable for dev where
// hard-kills happen often (closing the terminal, dev server restarts).
const STUCK_RECOVERY_INTERVAL_MS    = parseInt(process.env.WORKER_STUCK_RECOVERY_INTERVAL_MS || (60 * 1000),  10);   // default 1 minute
const STUCK_THRESHOLD_MINUTES       = parseInt(process.env.WORKER_STUCK_THRESHOLD_MINUTES    || '2',          10);   // default 2 minutes
const EXPIRED_CLEANUP_INTERVAL_MS   = 60 * 60 * 1000;   // 1 hour
const AUTH_CLEANUP_INTERVAL_MS      = parseInt(process.env.WORKER_AUTH_CLEANUP_INTERVAL_MS   || (60 * 60 * 1000), 10);   // default 1 hour

// Analytics: ring-buffer flush every ANALYTICS_FLUSH_INTERVAL_MS (default 5s).
// Daily rollup runs at the top of each hour - it checks "have I rolled
// up yesterday yet?" and computes if not. This avoids the failure mode
// of a single 00:05 UTC trigger where a worker restart at 00:04 would
// skip the day entirely.
const ROLLUP_CHECK_INTERVAL_MS      = parseInt(process.env.WORKER_ROLLUP_CHECK_INTERVAL_MS   || (60 * 60 * 1000), 10);
const TELEMETRY_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const CREDIT_EXPIRY_INTERVAL_MS     = parseInt(process.env.WORKER_CREDIT_EXPIRY_INTERVAL_MS || (24 * 60 * 60 * 1000), 10);   // default 24h

// One inflight set per type. Shutdown drains them in parallel.
const inflightByType = {
  email: new Set(),
  phone: new Set(),
};

// =========================================================================
// Main loop factory (one instance per type)
// =========================================================================

/**
 * Generic main-loop factory. Returns an async function that, when called,
 * loops until shutdown: claim a batch of items for `type`, process each
 * in parallel via `processorFn`, sleep when idle.
 *
 * @param {string} type             'email' or 'phone'
 * @param {function} processorFn    e.g. processEmailItem, processPhoneItem
 * @param {number} concurrency      max in-flight items per tick
 */
function makeMainLoop(type, processorFn, concurrency) {
  const inflight = inflightByType[type];
  if (!inflight) {
    throw new Error(`makeMainLoop: no inflight set registered for type "${type}"`);
  }

  async function tick() {
    if (shutdownState.shutting) return false;

    const items = await claimItems({ limit: concurrency, type });
    recordTick(items.length);

    if (items.length === 0) return false;

    // Process in parallel. Each processorFn handles its own errors and
    // writes its result back to the queue. Promise.allSettled ensures one
    // misbehaving item does not poison the batch.
    const promises = items.map((item) => {
      const p = processorFn(item)
        .then(() => { recordItemDone(); })
        .finally(() => { inflight.delete(p); });
      inflight.add(p);
      return p;
    });

    await Promise.allSettled(promises);
    return true;
  }

  return async function mainLoop() {
    console.log(`[worker:${type}] main loop started (concurrency=${concurrency})`);
    while (!shutdownState.shutting) {
      try {
        const hadWork = await tick();
        if (!hadWork) await sleep(POLL_INTERVAL_MS);
      } catch (err) {
        console.error(`[worker:${type}] mainLoop tick error:`, err);
        await sleep(POLL_INTERVAL_MS);
      }
    }
    console.log(`[worker:${type}] main loop stopped`);
  };
}

// =========================================================================
// Periodic tasks (type-agnostic)
// =========================================================================

async function stuckRecoveryLoop() {
  while (!shutdownState.shutting) {
    try {
      const stuck = await findStuckItems({ olderThanMinutes: STUCK_THRESHOLD_MINUTES });
      if (stuck.length > 0) {
        console.log(`[worker] recovering ${stuck.length} stuck item(s)`);
        for (const item of stuck) {
          if (shutdownState.shutting) break;
          await resetStuckItem(item.id);
        }
      }
    } catch (err) {
      console.error('[worker] stuckRecoveryLoop error:', err);
    }
    await interruptibleSleep(STUCK_RECOVERY_INTERVAL_MS);
  }
  console.log('[worker] stuck-recovery loop stopped');
}

async function expiredCleanupLoop() {
  while (!shutdownState.shutting) {
    try {
      const dropped = await cleanupExpiredJobs();
      if (dropped > 0) console.log(`[worker] cleaned up ${dropped} expired job(s)`);
    } catch (err) {
      console.error('[worker] expiredCleanupLoop error:', err);
    }
    await interruptibleSleep(EXPIRED_CLEANUP_INTERVAL_MS);
  }
  console.log('[worker] expired-cleanup loop stopped');
}

// Credit expiry. Daily tick zeroes unused remaining_amount on grants past expires_at.
async function creditExpiryLoop() {
  while (!shutdownState.shutting) {
    try {
      const r = await expireCredits();
      if (r.expired > 0 || r.errors > 0) {
        console.log(`[worker] credit expiry: expired=${r.expired} credits=${r.totalCreditsExpired} errors=${r.errors}`);
      }
    } catch (err) {
      console.error('[worker] creditExpiryLoop error:', err);
    }
    await interruptibleSleep(CREDIT_EXPIRY_INTERVAL_MS);
  }
  console.log('[worker] credit-expiry loop stopped');
}

/**
 * Auth-state housekeeping. Drops:
 *   - auth_rate_limits rows older than AUTH_CLEANUP_RATE_LIMIT_KEEP_HOURS
 *   - sessions expired or revoked older than AUTH_CLEANUP_SESSION_GRACE_HOURS
 *   - email_verification_codes consumed or expired past AUTH_CLEANUP_EVC_GRACE_HOURS
 *
 * Runs every WORKER_AUTH_CLEANUP_INTERVAL_MS (default 1h). Each branch is
 * isolated inside runAuthCleanups; one failing table does not block the others.
 */
async function authCleanupLoop() {
  while (!shutdownState.shutting) {
    try {
      const r = await runAuthCleanups();
      if (r.rateLimits || r.sessions || r.evcs) {
        console.log(
          `[worker] auth cleanup: rate_limits=${r.rateLimits} sessions=${r.sessions} evcs=${r.evcs} (${r.durationMs}ms)`
        );
      }
      if (r.errors.length > 0) {
        for (const e of r.errors) {
          console.error(`[worker] authCleanupLoop ${e.stage} error:`, e.message);
        }
      }
    } catch (err) {
      console.error('[worker] authCleanupLoop error:', err);
    }
    await interruptibleSleep(AUTH_CLEANUP_INTERVAL_MS);
  }
  console.log('[worker] auth-cleanup loop stopped');
}

/**
 * Drain the analytics ring buffer to PG every ~5s. Lossy on crash by
 * design - analytics aren't financial data and we don't want to slow
 * down web request handling waiting for INSERTs. The web process has
 * its own ring buffer; the worker has its own; both flush independently
 * to the same DB so ordering across processes is fine but each process
 * never duplicates a row.
 *
 * IMPORTANT: this loop runs inside the worker, so it only flushes the
 * worker's local buffer. The web process flushes its own buffer via a
 * setInterval set up at module load. See app/utils/analytics.server.js.
 */
async function analyticsFlushLoop() {
  while (!shutdownState.shutting) {
    try {
      const n = await flushAnalyticsBuffer();
      if (n > 0) console.log(`[worker] analytics flush: ${n} events`);
    } catch (err) {
      console.error('[worker] analyticsFlushLoop error:', err.message);
    }
    await interruptibleSleep(ANALYTICS_FLUSH_INTERVAL_MS);
  }
  // One last drain on shutdown so we don't lose the last few seconds.
  try {
    const n = await flushAnalyticsBuffer();
    if (n > 0) console.log(`[worker] analytics flush (shutdown): ${n} events`);
  } catch (err) {
    console.error('[worker] analyticsFlushLoop shutdown drain failed:', err.message);
  }
  console.log('[worker] analytics-flush loop stopped');
}

/**
 * Hourly check: is yesterday's daily rollup computed yet? If not,
 * compute it. Idempotent (ON CONFLICT DO UPDATE inside computeDailyRollup),
 * so a worker restart that re-triggers this is safe. Hourly cadence is
 * preferred over a single 00:05 UTC trigger because a worker restart
 * at 00:04 would otherwise skip the day.
 *
 * Also takes a swing at re-rolling today-so-far during the late-evening
 * hours so admin dashboards have a near-current picture without waiting
 * for the next-day snapshot.
 */
async function rollupLoop() {
  while (!shutdownState.shutting) {
    try {
      const now = new Date();
      const yesterdayUtc = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1
      )).toISOString().slice(0, 10);
      const todayUtc = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
      )).toISOString().slice(0, 10);

      const written = await computeDailyRollup(yesterdayUtc);
      if (written > 0) {
        console.log(`[worker] rollup ${yesterdayUtc}: ${written} rows`);
      }
      // Also compute today-so-far (cheap because the day is small at most
      // points; ON CONFLICT keeps the row fresh).
      await computeDailyRollup(todayUtc);
    } catch (err) {
      console.error('[worker] rollupLoop error:', err.message);
      recordWorkerError(err, { context: { loop: 'rollup' } }).catch(() => {});
    }
    await interruptibleSleep(ROLLUP_CHECK_INTERVAL_MS);
  }
  console.log('[worker] rollup loop stopped');
}

/**
 * Daily retention sweep for analytics_events + error_events. Lifts the
 * pattern from the auth cleanup loop; runs every 24h.
 */
async function telemetryRetentionLoop() {
  while (!shutdownState.shutting) {
    try {
      const evs = await cleanupOldAnalyticsEvents();
      const ers = await cleanupOldErrorEvents();
      if (evs || ers) {
        console.log(`[worker] telemetry retention: analytics=${evs} errors=${ers}`);
      }
    } catch (err) {
      console.error('[worker] telemetryRetentionLoop error:', err.message);
    }
    await interruptibleSleep(TELEMETRY_RETENTION_INTERVAL_MS);
  }
  console.log('[worker] telemetry-retention loop stopped');
}

// =========================================================================
// Helpers
// =========================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep that wakes up early if shutdown begins. Without this, a sleeping
 * periodic loop would block the entire shutdown for up to its interval
 * (60 minutes for cleanup). We poll the shutdownState every second.
 */
async function interruptibleSleep(totalMs) {
  const step = 1000;
  let elapsed = 0;
  while (elapsed < totalMs && !shutdownState.shutting) {
    await sleep(Math.min(step, totalMs - elapsed));
    elapsed += step;
  }
}

// Drain all in-flight work across all types. Used by the shutdown handler.
async function drainAllInflight(timeoutMs) {
  const sets = Object.entries(inflightByType);
  console.log(`[worker] draining in-flight: ${sets.map(([t, s]) => `${t}=${s.size}`).join(' ')}`);
  await Promise.all(sets.map(([, s]) => awaitInflight(s, timeoutMs)));
}

// =========================================================================
// Startup
// =========================================================================

async function main() {
  console.log('[worker] starting up');
  console.log(`[worker] poll_interval=${POLL_INTERVAL_MS}ms email_concurrency=${EMAIL_CONCURRENCY} phone_concurrency=${PHONE_CONCURRENCY}`);
  console.log(`[worker] stuck_threshold=${STUCK_THRESHOLD_MINUTES}min stuck_recovery_interval=${Math.round(STUCK_RECOVERY_INTERVAL_MS / 1000)}s auth_cleanup_interval=${Math.round(AUTH_CLEANUP_INTERVAL_MS / 1000)}s analytics_flush=${Math.round(ANALYTICS_FLUSH_INTERVAL_MS / 1000)}s rollup_check=${Math.round(ROLLUP_CHECK_INTERVAL_MS / 1000)}s`);

  await startHealthServer();

  registerShutdownHandlers(async () => {
    await drainAllInflight(60_000);
    await stopHealthServer();
  });

  // ── Boot-time orphan reset ──
  // Any item in 'processing' state at boot is from a prior worker that died
  // without cleaning up (hard kill, crash, terminal close, Windows
  // non-graceful Ctrl+C).
  //
  // Threshold: STUCK_THRESHOLD_MINUTES (default 2 min). The previous
  // implementation used 0 minutes, which was correct ONLY when guaranteed-
  // alone at boot. With multiple worker processes co-deployed (the launch
  // plan supports HA), threshold=0 would race a sibling worker that just
  // claimed an item milliseconds earlier and reset it back to 'pending',
  // triggering a duplicate probe. Using the same threshold as the periodic
  // recovery loop keeps the boot path multi-worker-safe at the cost of an
  // up-to-2-minute delay before the first reclaim, which is tolerable -
  // the periodic loop would have caught it within the same window anyway.
  try {
    const orphans = await findStuckItems({ olderThanMinutes: STUCK_THRESHOLD_MINUTES });
    if (orphans.length > 0) {
      console.log(`[worker] boot-time orphan reset: ${orphans.length} item(s) found in 'processing' state older than ${STUCK_THRESHOLD_MINUTES}min`);
      for (const item of orphans) {
        await resetStuckItem(item.id);
      }
      console.log(`[worker] boot-time orphan reset: complete`);
    }
  } catch (err) {
    console.error('[worker] boot-time orphan reset failed (continuing anyway):', err.message);
  }

  const emailMainLoop = makeMainLoop('email', processEmailItem, EMAIL_CONCURRENCY);
  const phoneMainLoop = makeMainLoop('phone', processPhoneItem, PHONE_CONCURRENCY);

  await Promise.all([
    emailMainLoop(),
    phoneMainLoop(),
    stuckRecoveryLoop(),
    expiredCleanupLoop(),
    authCleanupLoop(),
    analyticsFlushLoop(),
    rollupLoop(),
    telemetryRetentionLoop(),
    creditExpiryLoop(),
  ]);

  console.log('[worker] all loops stopped, exiting');
  process.exit(0);
}

main().catch((err) => {
  console.error('[worker] fatal startup error:', err);
  process.exit(1);
});
