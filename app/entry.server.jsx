// Server entry: enforces UTF-8 charset, streaming timeout, and CSP + security headers on every HTML response.

import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { recordServerError } from '~/utils/errors.server';

export const streamTimeout = 10_000;

const IS_PROD = process.env.NODE_ENV === 'production';

const CSP_DIRECTIVES = [
  `default-src 'self'`,
  // 'unsafe-inline' required for RR v7 streaming hydration blocks; do not remove without threading a nonce.
  `script-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' also covers inline style attributes on page-loader/ErrorBoundary; CSP2 conflates them with <style>.
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join('; ');

function applySecurityHeaders(responseHeaders) {
  // UTF-8 mandatory - without it browsers fall back to cp1252 and multi-byte chars render as mojibake.
  responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
  responseHeaders.set('Content-Security-Policy', CSP_DIRECTIVES);
  // frame-ancestors equivalent for older browsers; send both for belt and braces.
  responseHeaders.set('X-Frame-Options', 'DENY');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  responseHeaders.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  // HSTS in prod only; dev serves over http://localhost and HSTS would trap browsers into permanent cert failure.
  if (IS_PROD) {
    responseHeaders.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
}

export default function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  routerContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');

    // Bots get full onAllReady so crawlers see complete HTML; humans get streamed shell for faster TTFB.
    const readyOption =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? 'onAllReady'
        : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          applySecurityHeaders(responseHeaders);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          // Streaming errors fire after headers flushed - user already saw a partial page; log and capture.
          if (shellRendered) {
            console.error('[entry.server] streaming render error:', error);
            recordServerError(error, request, {
              kind: 'server_route',
              severity: 'error',
              context: { phase: 'streaming_render' },
            }).catch(() => {});
          }
        },
      },
    );

    // +1s buffer lets rejected boundaries flush before the render is aborted.
    setTimeout(abort, streamTimeout + 1000);
  });
}

// Authoritative capture for server-side route errors (loaders, actions). Aborted requests are navigation noise, skip.

// URL patterns that indicate bot vulnerability scanning. The site does not serve any of these paths, so a request matching them is noise regardless of what error was thrown.
const BOT_PROBE_PATTERNS = [
  /\.(php|aspx|asp|cgi|jsp)(\/|$|\?)/i,
  /(^|\/)(wp-|xmlrpc|phpinfo|_ignition|_profiler|adminer)/i,
  /(^|\/)\.(env|git|aws|docker|htaccess|ssh|npm)(\.|\/|$)/i,
  /(^|\/)(vendor|node_modules)\//i,
];

function isBotProbePath(pathname) {
  return BOT_PROBE_PATTERNS.some((rx) => rx.test(pathname));
}

// React Router internal ErrorResponse: same category as thrown Response 4xx, but a plain object with internal:true. Covers 405 on catchall POSTs and 404 on unknown routes.
function isInternalErrorResponse(error) {
  return (
    error &&
    typeof error === 'object' &&
    error.internal === true &&
    typeof error.status === 'number'
  );
}

export function handleError(error, { request }) {
  if (request.signal.aborted) return;
  // 4xx Response throws are routing outcomes (thrown 404s, 401s, gated redirects), not runtime bugs.
  if (error instanceof Response && error.status < 500) return;
  // 4xx internal ErrorResponse (React Router's own 405/404 outcomes from POSTs and misses on the catchall route).
  if (isInternalErrorResponse(error) && error.status < 500) return;
  // Bot probes: known WordPress, PHP, .env, .git, vendor scan paths - drop regardless of error type.
  try {
    const url = new URL(request.url);
    if (isBotProbePath(url.pathname)) return;
  } catch {
    // Malformed URL, fall through and let the normal recording path handle it.
  }
  console.error('[handleError]', error);
  // Fire-and-forget; telemetry failure must not turn into a second error.
  recordServerError(error, request, {
    kind: 'server_route',
    severity: 'error',
  }).catch((insertErr) => {
    console.error('[handleError] failed to record:', insertErr.message);
  });
}
