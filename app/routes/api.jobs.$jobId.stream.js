// GET /api/jobs/:jobId/stream - SSE progress stream until terminal. Auth re-checked every 30s.

import { requireUser, getSessionFromRequest } from '~/utils/session.server';
import { getJobForUser, getJobProgress } from '~/lib/jobQueue.server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_INTERVAL_MS = 1000;
const MAX_DURATION_MS  = 30 * 60 * 1000;
const AUTH_RECHECK_MS  = 30 * 1000;
const TERMINAL_STATES  = new Set(['complete', 'partial', 'cancelled', 'failed']);

export async function loader({ request, params }) {
  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId || !UUID_RE.test(jobId)) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId must be a UUID' },
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

      // Initial snapshot immediately so the client doesn't wait a full poll.
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

        // Session may have been revoked since connect - re-check every AUTH_RECHECK_MS.
        if (Date.now() - lastAuthCheckAt >= AUTH_RECHECK_MS) {
          lastAuthCheckAt = Date.now();
          try {
            const session = await getSessionFromRequest(request);
            if (!session || session.user.id !== user.id) {
              send({}, 'auth_expired');
              close();
              return;
            }
          } catch (err) {
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
