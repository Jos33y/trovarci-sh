/* ═══════════════════════════════════════════════════════════════════════════
   entry.server.jsx

   The server entry point. RR v7 ships a default if this file is absent;
   we own this one for three reasons:

     1. Force `Content-Type: text/html; charset=utf-8` on every response.
        Without an explicit charset, browsers fall back to cp1252 / Latin-1
        and any UTF-8 multi-byte character in the source (the middle dot
        in `1 Credit / scan · 936 left`, accented names, em characters)
        renders as mojibake (`Â·`). React then sees a hydration mismatch
        between the server-rendered bytes (decoded as cp1252) and the
        client-side bundle (which carries the original `·` literal).

     2. Lock in the streaming timeout so any future loader regression
        cannot silently stall a page beyond 10s.

     3. Apply HTTP security headers on every HTML response. CSP, HSTS,
        X-Frame-Options, X-Content-Type-Options, Referrer-Policy and
        Permissions-Policy are set here so a route loader cannot
        accidentally weaken them. JSON / API responses are unaffected
        (they go through resource routes, not this handler).

   CSP design notes:
     - script-src 'self' 'unsafe-inline'   RR v7 streaming injects inline
       <script> blocks carrying hydration data (window.__remixContext).
       Generating a per-request nonce and threading it through the
       streaming render is non-trivial and breaks on shell-error fallbacks.
       'unsafe-inline' is the documented practical default for RR
       (https://reactrouter.com/explanation/special-files#entryserverjsx).
     - style-src 'unsafe-inline'   We use the inline `style` attribute on
       the page-loader and ErrorBoundary; that is a style attribute, not
       a <style> tag, but several browsers conflate the two under CSP2.
       Including 'unsafe-inline' covers both.
     - frame-ancestors 'none'      Equivalent to X-Frame-Options: DENY but
       respected by modern browsers. We send both for belt+braces.
     - upgrade-insecure-requests   Forces any embedded http:// asset to be
       fetched as https://. Cheap defence.

   Bot detection: bots get the full `onAllReady` payload (no streaming
   skeleton) so crawlers see a complete page. Humans get the streamed
   shell on `onShellReady` for faster TTFB.
   ═══════════════════════════════════════════════════════════════════════════ */

import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { recordServerError } from '~/utils/errors.server';

export const streamTimeout = 10_000;

const IS_PROD = process.env.NODE_ENV === 'production';

// Built once at module load. All values are static so we don't pay the
// string-build cost per request.
const CSP_DIRECTIVES = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  // Force any http:// embed to be fetched as https://. No-op when the page
  // itself loaded over https; cheap defence against accidental http embeds.
  `upgrade-insecure-requests`,
].join('; ');

function applySecurityHeaders(responseHeaders) {
  // Charset on every response (the original reason this file exists).
  responseHeaders.set('Content-Type', 'text/html; charset=utf-8');

  // CSP. Browsers ignore unknown directives, so the same string is safe in
  // dev and prod.
  responseHeaders.set('Content-Security-Policy', CSP_DIRECTIVES);

  // Belt + braces for older browsers that lack frame-ancestors support.
  responseHeaders.set('X-Frame-Options', 'DENY');

  // Stop content sniffing. Mandatory; cheap.
  responseHeaders.set('X-Content-Type-Options', 'nosniff');

  // Send referrer to same-origin in full, cross-origin only the origin.
  responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Lock down powerful APIs we don't use.
  responseHeaders.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  // HSTS: only send in production. In dev we serve over http://localhost
  // and HSTS would lock the dev cert into a permanent failure on browsers
  // that have already cached the header.
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

    // Bots get the complete payload (no progressive streaming) so crawlers
    // see fully-rendered HTML. SPA mode also waits for full ready since
    // there's no SSR shell to stream.
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
          // Once the shell has flushed, the response is already on the
          // wire. We can't change the status code, only log so the
          // failure is visible in server output.
          responseStatusCode = 500;
          if (shellRendered) {
            console.error('[entry.server] streaming render error:', error);
            // Fire-and-forget capture into error_events. Streaming-stage
            // errors are particularly valuable: they happen after the
            // browser already started receiving HTML, so the user saw
            // a partial page with no obvious failure.
            recordServerError(error, request, {
              kind: 'server_route',
              severity: 'error',
              context: { phase: 'streaming_render' },
            }).catch(() => {});
          }
        },
      },
    );

    // Abort the React render slightly after streamTimeout so any rejected
    // boundaries get a chance to flush before the connection closes.
    setTimeout(abort, streamTimeout + 1000);
  });
}

/**
 * RR v7 server-side error hook. Called for every error caught by route
 * loaders, actions, and server components. This is the authoritative
 * capture point for server-side route errors - more reliable than
 * sprinkling try/catch through every loader.
 *
 * Reference: https://reactrouter.com/how-to/error-reporting
 *
 * Aborted requests (user navigated away mid-render) are not real errors;
 * skip them so the dashboard isn't polluted by ordinary navigation noise.
 */
export function handleError(error, { request }) {
  if (request.signal.aborted) return;

  // Always log so the dev console still shows the trace.
  console.error('[handleError]', error);

  // Fire-and-forget; we never want telemetry to block error response
  // delivery to the user. A failure to record an error must not turn
  // into a second error.
  recordServerError(error, request, {
    kind: 'server_route',
    severity: 'error',
  }).catch((insertErr) => {
    console.error('[handleError] failed to record:', insertErr.message);
  });
}
