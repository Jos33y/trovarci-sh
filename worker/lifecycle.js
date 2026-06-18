/* ═══════════════════════════════════════════════════════════════════════════
   worker/lifecycle.js

   Graceful shutdown coordination. SIGTERM (Coolify redeploy) or SIGINT
   (Ctrl+C in dev) trigger drain mode:

     1. Set shutdownState.shutting = true so the main loop stops claiming
        new items
     2. Wait for in-flight items to finish (with timeout)
     3. Run the cleanup callback (close health server, etc.)
     4. process.exit(0)

   A second signal during drain triggers immediate exit(1). This handles
   the "I really mean it" Ctrl+C combo and the rare Coolify case where
   the redeploy budget has expired.

   Why not just process.exit() on signal:
     SMTP probes can take 5-10 seconds. Killing mid-probe leaves the
     destination MX with an unfinished conversation (it'll close the
     socket and move on, but our row stays in 'processing' state). The
     stuck-item recovery would catch it after 10 minutes - working but
     not great. Draining cleanly closes the loop.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHUTDOWN_TIMEOUT_MS = 60_000;

export const shutdownState = {
  shutting: false,
};

/**
 * Wire SIGTERM/SIGINT to a single shutdown sequence. Pass a callback
 * that closes external resources (health server, logger flush, etc.)
 * once in-flight work has drained.
 *
 * @param {() => Promise<void>} cleanupFn
 */
export function registerShutdownHandlers(cleanupFn) {
  let triggered = false;

  async function shutdown(signal) {
    if (triggered) {
      console.log(`[worker] received second ${signal}, hard exit`);
      process.exit(1);
    }
    triggered = true;
    shutdownState.shutting = true;
    console.log(`[worker] received ${signal}, draining...`);

    try {
      await cleanupFn();
      console.log('[worker] clean shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('[worker] shutdown error:', err);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

/**
 * Wait for an inflight Promise set to drain, with a timeout. The set is
 * mutated as items complete - we just race the drain Promise against a
 * timeout.
 *
 * @param {Set<Promise<unknown>>} inflight
 * @param {number} [timeoutMs]
 */
export async function awaitInflight(inflight, timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  if (inflight.size === 0) return;
  console.log(`[worker] waiting for ${inflight.size} in-flight item(s)...`);

  const drain = Promise.allSettled([...inflight]);
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));

  await Promise.race([drain, timeout]);

  if (inflight.size > 0) {
    console.warn(`[worker] timeout reached with ${inflight.size} item(s) still in flight`);
  } else {
    console.log('[worker] all in-flight items finished');
  }
}
