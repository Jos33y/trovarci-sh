/* ═══════════════════════════════════════════════════════════════════════════
   httpProbe.server.js

   HTTP(S) probing for the Domain Checker. Two capabilities:

     1. probeHttpsRedirect(domain)
        - HEAD http://domain
        - Follows redirects, up to 5 hops
        - Reports whether the final URL is HTTPS, and whether the first
          hop returned a 301 (ideal) or 302 (acceptable)

     2. probeWebsite(domain)
        - GET https://domain, discarding the body
        - Times the response
        - Inspects security headers
        - Returns a structured header analysis

   Uses Node's built-in http and https modules to avoid a dependency.
   ═══════════════════════════════════════════════════════════════════════════ */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const REQUEST_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'TrovarcisBot/1.0 (+https://trovarci.sh/domain)';

/**
 * Shared request helper. Returns a promise that resolves with the response
 * object (headers + status + no body consumed unless includeBody). Rejects
 * on timeout or network error.
 */
function requestOnce(urlString, method, includeBody = false) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(new Error(`Invalid URL: ${urlString}`));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const start = Date.now();

    const req = client.request(
      {
        method,
        host: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          Connection: 'close',
        },
        // We accept invalid certs here because the redirect probe needs to
        // know even broken HTTPS setups respond. SSL validity is checked
        // separately by sslCheck.
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const responseTimeMs = Date.now() - start;
        if (!includeBody) {
          res.resume(); // drain without buffering
          resolve({
            status: res.statusCode,
            headers: res.headers,
            location: res.headers.location || null,
            responseTimeMs,
            url: urlString,
          });
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          // Cap body capture at 64KB; we never need more for this tool.
          if (size < 65536) chunks.push(c);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            location: res.headers.location || null,
            responseTimeMs,
            url: urlString,
            bodySize: size,
          });
        });
        res.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Request to ${urlString} timed out`));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Follow redirects up to MAX_REDIRECTS hops. Returns an array of step
 * objects plus the final response.
 */
async function followChain(initialUrl, method = 'HEAD') {
  const chain = [];
  let currentUrl = initialUrl;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const res = await requestOnce(currentUrl, method);
    chain.push({ url: currentUrl, status: res.status, location: res.location });
    if (res.status >= 300 && res.status < 400 && res.location) {
      try {
        currentUrl = new URL(res.location, currentUrl).toString();
      } catch {
        return { chain, finalResponse: res };
      }
      continue;
    }
    return { chain, finalResponse: res };
  }
  // Too many redirects.
  return {
    chain,
    finalResponse: null,
    error: `More than ${MAX_REDIRECTS} redirects`,
  };
}

/**
 * Probe whether http://domain redirects to HTTPS.
 */
export async function probeHttpsRedirect(domain) {
  const result = {
    ok: false,
    startUrl: `http://${domain}/`,
    finalUrl: null,
    redirectsToHttps: false,
    firstHopStatus: null,
    chain: [],
    error: null,
  };

  try {
    const { chain, finalResponse, error } = await followChain(result.startUrl, 'HEAD');
    result.chain = chain;
    if (error || !finalResponse) {
      result.error = error || 'No final response';
      return result;
    }
    result.firstHopStatus = chain[0]?.status || null;
    result.finalUrl = finalResponse.url;
    result.redirectsToHttps = finalResponse.url.startsWith('https://');
    result.ok = true;
  } catch (err) {
    result.error = err.message || String(err);
  }
  return result;
}

/**
 * Probe https://domain. GETs the homepage (not HEAD, because some servers
 * return different headers on HEAD vs GET) and inspects headers and timing.
 */
export async function probeWebsite(domain) {
  const result = {
    ok: false,
    url: `https://${domain}/`,
    status: null,
    responseTimeMs: null,
    headers: {},
    securityHeaders: null,
    error: null,
  };

  try {
    // Follow redirects on the HTTPS side so we land on the final page even
    // if the domain redirects to www or a subdir.
    const { finalResponse, error } = await followChain(result.url, 'GET');
    if (error || !finalResponse) {
      result.error = error || 'No response';
      return result;
    }
    result.status = finalResponse.status;
    result.responseTimeMs = finalResponse.responseTimeMs;
    result.headers = finalResponse.headers;
    result.securityHeaders = analyzeSecurityHeaders(finalResponse.headers);
    result.ok = true;
  } catch (err) {
    result.error = err.message || String(err);
  }
  return result;
}

/**
 * Structured security-header analysis. Each entry is one of:
 *   { present: true, value }
 *   { present: false }
 * plus a summary count for the UI.
 */
export function analyzeSecurityHeaders(headers) {
  const lower = {};
  for (const [k, v] of Object.entries(headers || {})) {
    lower[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }

  const hsts = lower['strict-transport-security']
    ? { present: true, value: lower['strict-transport-security'] }
    : { present: false };

  const xcto = lower['x-content-type-options']
    ? { present: true, value: lower['x-content-type-options'] }
    : { present: false };

  const xfo = lower['x-frame-options']
    ? { present: true, value: lower['x-frame-options'] }
    : { present: false };

  const csp = lower['content-security-policy']
    ? { present: true, value: lower['content-security-policy'] }
    : { present: false };

  // Modern equivalent: CSP with frame-ancestors. Counts as framing
  // protection when X-Frame-Options is missing.
  const cspFrameAncestors =
    csp.present && /frame-ancestors/i.test(csp.value || '');

  const referrerPolicy = lower['referrer-policy']
    ? { present: true, value: lower['referrer-policy'] }
    : { present: false };

  // Three critical headers for email-sending domain credibility: HSTS,
  // X-Content-Type-Options, and framing protection (XFO or CSP ancestors).
  const criticalPresent = [
    hsts.present,
    xcto.present,
    xfo.present || cspFrameAncestors,
  ].filter(Boolean).length;

  return {
    hsts,
    xcto,
    xfo,
    csp,
    referrerPolicy,
    cspFrameAncestors,
    criticalPresent,
    criticalTotal: 3,
  };
}
