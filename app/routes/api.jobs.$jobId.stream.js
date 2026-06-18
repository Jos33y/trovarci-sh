/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/jobs/:jobId/stream

   Server-Sent Events stream of job progress. Updates every 1 second
   until the job reaches a terminal status, then sends a 'complete'
   event and closes the stream. The client (EventSource) reconnects
   automatically if the connection drops; on reconnect it sees the
   current state immediately and resumes streaming.

   Why SSE not WebSocket:
     One-way server -> client updates. SSE is the right HTTP-native
     primitive: standardised (text/event-stream), HTTP/2 friendly,
     handles reconnect automatically, no protocol negotiation needed.
     WebSocket would be over-engineering for one-way push.

   Why a 30-minute hard cap:
     A misbehaving client (closed tab, dead network) would otherwise
     keep this loop running forever. Coolify health checks would catch
     a hung server eventually, but a 30min ceiling on the stream itself
     is a cheaper backstop. The client reconnects if it cares.

   Headers:
     - Content-Type: text/event-stream  (mandatory)
     - Cache-Control: no-cache          (prevent caching layers)
     - Connection: keep-alive
     - X-Accel-Buffering: no            (Cloudflare/nginx buffering off)

   Events:
     data: { ...progress }      (every poll tick)
     event: complete + data: {} (when terminal status reached)
     event: timeout + data: {}  (30min cap hit before terminal)
     event: gone + data: {}     (job vanished mid-stream)
     event: error + data: {error}

   Auth: required, ownership enforced once at start.
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser, getSessionFromRequest } from '~/utils/session.server';
import { getJobForUser, getJobProgress } from '~/lib/jobQueue.server';

const POLL_INTERVAL_MS    = 1000;
const MAX_DURATION_MS     = 30 * 60 * 1000;
// Re-check the session every 30 seconds during a long-running stream. A
// session revoked via /logout (or expired by max-age) keeps streaming
// otherwise, since the initial requireUser check only runs once at
// connection time. The check is cheap (one indexed SELECT against
// sessions.token_hash) so 30s is comfortable.
const AUTH_RECHECK_MS     = 30 * 1000;
const TERMINAL_STATES     = new Set(['complete', 'partial', 'cancelled', 'failed']);

export async function loader({ request, params }) {
  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId is required' },
      { status: 400 },
    );
  }

  const owned = await getJobForUser(jobId, user.id);
  if (!owned) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', error: 'Job not found' },
      { status: 404 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let lastAuthCheckAt = Date.now();
      let closed = false;
      let interval = null;

      const send = (data, event) => {
        if (closed) return;
        try {
          if (event) controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        try { controller.close(); } catch {}
      };

      // Send initial state immediately so the client doesn't wait a full
      // poll interval to see anything.
      try {
        const initial = await getJobProgress(jobId);
        if (!initial) {
          send({}, 'gone');
          close();
          return;
        }
        send(initial);
        if (TERMINAL_STATES.has(initial.status)) {
          send({}, 'complete');
          close();
          return;
        }
      } catch (err) {
        send({ error: err.message }, 'error');
        close();
        return;
      }

      interval = setInterval(async () => {
        if (closed) return;

        if (Date.now() - startedAt > MAX_DURATION_MS) {
          send({}, 'timeout');
          close();
          return;
        }

        // Periodic auth re-check. Closes the stream when the session is no
        // longer valid (logged out, revoked, or expired). The client can
        // reconnect; if so, the new connection's requireUser() will 401
        // and the EventSource will give up cleanly.
        if (Date.now() - lastAuthCheckAt >= AUTH_RECHECK_MS) {
          lastAuthCheckAt = Date.now();
          try {
            const session = await getSessionFromRequest(request);
            // Session must still exist AND still belong to the original
            // user. The latter guards the unlikely case of token reuse
            // across users (cookie collision attempts, hostile reuse).
            if (!session || session.user.id !== user.id) {
              send({}, 'auth_expired');
              close();
              return;
            }
          } catch (err) {
            // DB hiccup on the auth check itself - close defensively.
            // Better to drop the stream and let the client reconnect than
            // to keep streaming under uncertain auth.
            send({ error: 'auth check failed' }, 'error');
            close();
            return;
          }
        }

        try {
          const progress = await getJobProgress(jobId);
          if (!progress) {
            send({}, 'gone');
            close();
            return;
          }
          send(progress);
          if (TERMINAL_STATES.has(progress.status)) {
            send({}, 'complete');
            close();
          }
        } catch (err) {
          send({ error: err.message }, 'error');
          close();
        }
      }, POLL_INTERVAL_MS);

      // Client disconnect (closed tab, network drop, navigation).
      request.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
