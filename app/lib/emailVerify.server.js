/* ═══════════════════════════════════════════════════════════════════════════
   emailVerify.server.js

   The verification pipeline. One public function: verifyOneEmail(email).
   Composes every other primitive in this layer:

     - dnsLookup.server      MX resolution
     - ssrfGuard.server      block private/reserved MX targets
     - disposableDomains     in-memory Set lookup
     - catchallCache         24h cached catch-all status per domain
     - proxyRotation         SOCKS5 proxy with sticky sessions
     - SMTP RCPT TO probe    actual mailbox existence check (this file)

   Pipeline stages, in order, short-circuit on terminal verdicts:

     1. Syntax check         RFC-loose. Bad syntax -> invalid, no probe.
     2. Disposable tag       Set lookup. Doesn't short-circuit; tagged for
                             classification later.
     3. Role tag             Regex on local part. Same: tagged, not short.
     4. Free-provider tag    Set lookup. Same: tagged, not short.
     5. MX lookup            DNS. No MX -> invalid, no probe.
     6. SSRF guard on MX     Reject if MX resolves to private/reserved IP.
     7. Catch-all check      Cache hit -> use it. Miss -> probe random
                             local part -> cache result. Catch-all -> risky,
                             skip RCPT to actual address.
     8. SMTP RCPT TO probe   Through SOCKS5 proxy, port 25.
     9. Classification       Combine probe result + tags into final verdict.

   Result shape:

     { ok: true, result: {
         email, domain, category, subcategory, smtpResponse,
         isDisposable, isRole, isFreeProvider, isCatchall, mxHost,
         durationMs, steps: [{ name, status, detail }]
     } }

   Or, on infrastructure failure (timeout, proxy failure, internal error):

     { ok: false, code, error, result: { ... partial info ... } }

   Caller refunds when ok:false. Caller does NOT refund when ok:true with
   category='unknown' (we did the work, the answer is genuinely uncertain).

   Greylisting:
     verifyOneEmail returns ok:true with category='unknown' and
     subcategory='greylist' on a 4xx response. Single-mode callers treat
     this as the verdict. Bulk-mode callers (the worker) detect the
     greylist marker and call jobQueue.scheduleItemRetry instead of
     markItemDone.

   Never throws. All exceptions become ok:false results.
   ═══════════════════════════════════════════════════════════════════════════ */

import net from 'node:net';
import { SocksClient } from 'socks';

import { resolveMx } from '../utils/dnsLookup.server.js';
import { assertSafeHost } from '../utils/ssrfGuard.server.js';
import { isDisposable } from './disposableDomains.server.js';
import { getCatchall, setCatchall } from './catchallCache.server.js';
import { getProxy, releaseProxy, markBlocked } from './proxyRotation.server.js';

/* ─── Config ───────────────────────────────────────────────────────────── */

const MX_LOOKUP_TIMEOUT_MS = 7_000;
const PROXY_CONNECT_TIMEOUT_MS = 12_000;
const SMTP_STEP_TIMEOUT_MS = 10_000;
const SMTP_TOTAL_BUDGET_MS = 30_000;

const RANDOM_LOCAL_PART_LEN = 16;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HELO_HOSTNAME = process.env.EMAIL_VERIFY_HELO_HOSTNAME || 'trovarci.sh';
const FROM_ADDRESS = process.env.EMAIL_VERIFY_FROM_ADDRESS || 'verify@trovarci.sh';

/**
 * DEV-ONLY: bypass the proxy and connect directly from this machine's IP.
 * Set EMAIL_VERIFY_ALLOW_DIRECT=true in .env to enable. NEVER enable this
 * in production for these reasons:
 *   1. Your VPS IP gets blacklisted on first wave of probes - SMTP servers
 *      treat unrotated probing as abuse. Once blacklisted, recovery takes
 *      days and damages reputation for any LEGITIMATE mail you send.
 *   2. No country-targeting. Some MX servers reject foreign IPs entirely.
 *   3. No session isolation. Greylist-driven retries hit from the same IP
 *      and look like a single misbehaving client.
 *
 * This flag exists only so dev/staging can verify the SMTP dialog code
 * path works end-to-end before IPRoyal credentials are provisioned.
 *
 * Logged loudly at module load so it's impossible to miss in production
 * logs if someone forgets to unset it.
 */
const ALLOW_DIRECT_CONNECT = process.env.EMAIL_VERIFY_ALLOW_DIRECT === 'true';
if (ALLOW_DIRECT_CONNECT) {
  console.warn('[emailVerify] EMAIL_VERIFY_ALLOW_DIRECT=true - DEV ONLY. Probes will use this machine\'s IP. NEVER enable in production.');
}

/**
 * Role-account local parts. Treated as risky-role even if the mailbox
 * actually exists - they're high-complaint addresses.
 */
const ROLE_REGEX = /^(?:abuse|admin|administrator|all|billing|career|careers|compliance|contact|enquiry|enquiries|finance|help|hello|hostmaster|hr|info|jobs|legal|mail|marketing|media|news|noc|noreply|no-reply|office|orders|postmaster|press|privacy|purchasing|root|sales|security|service|services|shop|spam|staff|support|sysadmin|team|webmaster)@/i;

/**
 * Major free-mail providers. Tagged for downstream classification but not
 * a verdict on their own. A B2B sender targeting "info@gmail.com" wants
 * to know it's a personal address; we surface that via this tag.
 */
const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'yahoo.es', 'yahoo.com.br',
  'ymail.com', 'rocketmail.com',
  'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.it', 'outlook.es',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'live.com', 'live.co.uk', 'live.fr', 'live.de',
  'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'gmx.com', 'gmx.net', 'gmx.de',
  'zoho.com', 'zohomail.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'tutanota.com', 'tuta.io',
  'mail.ru', 'list.ru', 'bk.ru', 'inbox.ru',
  'yandex.com', 'yandex.ru', 'ya.ru',
  'qq.com', '163.com', '126.com', 'sina.com',
  'naver.com',
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Verify a single email address end to end.
 *
 * @param {string} email - the address to verify (any case, will be normalized)
 * @param {object} [opts]
 * @param {string} [opts.country] - ISO 2-letter country code for proxy exit
 * @param {boolean} [opts.skipProbe] - debug-only flag to stop after MX
 *   lookup. Should never be true in production.
 *
 * @returns {Promise<
 *   | { ok: true,  result: object }
 *   | { ok: true,  result: object, greylisted: true }
 *   | { ok: false, code: string, error: string, result: object }
 * >}
 */
export async function verifyOneEmail(email, opts = {}) {
  const start = Date.now();
  const result = freshResult();

  try {
    // ─── Step 1: syntax ───────────────────────────────────────────────────
    const syntax = parseAndValidateEmail(email);
    if (!syntax.ok) {
      result.email = String(email == null ? '' : email).slice(0, MAX_EMAIL_LENGTH).toLowerCase();
      result.category = 'invalid';
      result.subcategory = 'syntax';
      pushStep(result, 'syntax', 'fail', syntax.error);
      result.durationMs = Date.now() - start;
      return { ok: true, result };
    }
    result.email = syntax.value;
    result.domain = syntax.domain;
    pushStep(result, 'syntax', 'pass', 'Properly formatted');

    // ─── Steps 2-4: cheap tags (no I/O) ───────────────────────────────────
    try {
      result.isDisposable = isDisposable(result.domain);
    } catch {
      // Disposable list failed to load. Don't block verification - just leave the tag false.
      result.isDisposable = false;
    }
    result.isRole = ROLE_REGEX.test(syntax.value);
    result.isFreeProvider = FREE_PROVIDERS.has(result.domain);

    // ─── Step 5: MX lookup ────────────────────────────────────────────────
    const mx = await resolveMx(result.domain, MX_LOOKUP_TIMEOUT_MS);
    if (!mx.ok || !Array.isArray(mx.value) || mx.value.length === 0) {
      result.category = 'invalid';
      result.subcategory = 'no_mx';
      pushStep(result, 'domain', 'fail',
        mx.isNoRecord ? 'Domain has no MX records' : 'Could not resolve MX records');
      result.durationMs = Date.now() - start;
      return { ok: true, result };
    }
    pushStep(result, 'domain', 'pass', `${mx.value.length} MX record(s)`);

    const primaryMx = mx.value[0].exchange;
    result.mxHost = primaryMx;

    // ─── Step 6: SSRF guard ───────────────────────────────────────────────
    const guard = await assertSafeHost(primaryMx);
    if (!guard.ok) {
      result.category = 'unknown';
      pushStep(result, 'mx_safety', 'fail', guard.reason);
      result.durationMs = Date.now() - start;
      return {
        ok: false,
        code: 'EMAIL_VERIFY_UNSAFE_MX',
        error: guard.reason,
        result,
      };
    }

    if (opts.skipProbe) {
      result.category = 'unknown';
      pushStep(result, 'mailbox', 'warn', 'Probe skipped by caller');
      result.durationMs = Date.now() - start;
      return { ok: true, result };
    }

    // ─── Step 7: catch-all check (cache or live) ──────────────────────────
    const cached = await getCatchall(result.domain).catch(() => null);
    if (cached) {
      result.isCatchall = cached.isCatchall;
    } else {
      const randomLocal = randomLocalPart(RANDOM_LOCAL_PART_LEN);
      const probe = await probeMx(primaryMx, `${randomLocal}@${result.domain}`, opts);
      if (probe.ok && !probe.greylisted) {
        result.isCatchall = probe.accepted === true;
        // Cache only definitive results. If accepted is null (5xx that
        // wasn't a clear "no such user"), we don't trust the verdict.
        if (probe.accepted === true || probe.accepted === false) {
          await setCatchall(result.domain, probe.accepted).catch(() => {});
        }
      }
      // If catch-all probe failed entirely, leave isCatchall=false and
      // continue to the real probe. Worst case is we treat a catch-all
      // domain as not-catchall on this run; the real probe still runs
      // and the caller still gets a verdict.
    }

    if (result.isCatchall) {
      result.category = 'risky';
      result.subcategory = 'catchall';
      result.smtpResponse = 'Domain accepts all addresses';
      pushStep(result, 'mailbox', 'warn', 'Server accepts all addresses (catch-all)');
      result.durationMs = Date.now() - start;
      return { ok: true, result };
    }

    // ─── Step 8: real RCPT TO probe ───────────────────────────────────────
    const probe = await probeMx(primaryMx, syntax.value, opts);

    if (!probe.ok) {
      // Infrastructure failure - timeout, proxy down, TCP reset, etc.
      // Caller refunds. We pass the partial info so the UI can still
      // show what we did get (syntax pass, MX records found, etc).
      result.category = 'unknown';
      pushStep(result, 'mailbox', 'warn', 'Could not complete SMTP probe');
      result.durationMs = Date.now() - start;
      return {
        ok: false,
        code: probe.code || 'EMAIL_VERIFY_PROBE_FAILED',
        error: probe.error || 'SMTP probe failed',
        result,
      };
    }

    if (probe.greylisted) {
      result.category = 'unknown';
      result.subcategory = 'greylist';
      result.smtpResponse = probe.smtpResponse || null;
      pushStep(result, 'mailbox', 'warn', 'Server delayed (greylisted) - try again later');
      result.durationMs = Date.now() - start;
      return { ok: true, result, greylisted: true };
    }

    result.smtpResponse = probe.smtpResponse || null;

    if (probe.accepted === true) {
      pushStep(result, 'mailbox', 'pass', 'Mailbox exists');
      classifyAccepted(result);
    } else if (probe.accepted === false) {
      pushStep(result, 'mailbox', 'fail', 'Mailbox does not exist');
      result.category = 'invalid';
      result.subcategory = 'mailbox';
    } else {
      // Server returned something we couldn't classify (rare 5xx on RCPT
      // that's not a clear rejection). Treat as unknown.
      pushStep(result, 'mailbox', 'warn', 'Server response was inconclusive');
      result.category = 'unknown';
    }

    result.durationMs = Date.now() - start;
    return { ok: true, result };

  } catch (err) {
    // Belt-and-braces: any unexpected throw becomes a clean ok:false.
    result.durationMs = Date.now() - start;
    return {
      ok: false,
      code: 'EMAIL_VERIFY_INTERNAL',
      error: err && err.message ? err.message : String(err),
      result,
    };
  }
}

// ============================================================================
// Internals
// ============================================================================

function freshResult() {
  return {
    email: '',
    domain: '',
    category: 'unknown',
    subcategory: null,
    smtpResponse: null,
    isDisposable: false,
    isRole: false,
    isFreeProvider: false,
    isCatchall: false,
    mxHost: null,
    durationMs: 0,
    steps: [],
  };
}

function pushStep(result, name, status, detail) {
  result.steps.push({ name, status, detail });
}

/**
 * Validate + normalize. Mirror of utils/validation.server.validateEmail
 * but inlined here so this module has no cross-cutting dep on the
 * validation utility (which is also used by auth flows we don't want
 * coupling to the verifier lib).
 */
function parseAndValidateEmail(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Email is required' };
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: 'Email is required' };
  if (trimmed.length > MAX_EMAIL_LENGTH) return { ok: false, error: 'Email is too long' };
  if (!EMAIL_REGEX.test(trimmed)) return { ok: false, error: 'Invalid email format' };
  const domain = trimmed.split('@')[1];
  if (!domain || domain.length < 4) return { ok: false, error: 'Invalid email domain' };
  return { ok: true, value: trimmed, domain };
}

/**
 * Decide the final category for an "RCPT accepted" result based on the
 * tags we collected. Disposable wins over role wins over free-provider
 * (most actionable signal first).
 */
function classifyAccepted(result) {
  if (result.isDisposable) {
    result.category = 'risky';
    result.subcategory = 'disposable';
    return;
  }
  if (result.isRole) {
    result.category = 'risky';
    result.subcategory = 'role';
    return;
  }
  // Free provider is metadata, not a verdict by itself. The address is
  // valid; the UI surfaces "free_provider" as informational.
  if (result.isFreeProvider) {
    result.category = 'valid';
    result.subcategory = 'free_provider';
    return;
  }
  result.category = 'valid';
  result.subcategory = null;
}

function randomLocalPart(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ============================================================================
// SMTP probe (the heart of the verifier)
// ============================================================================

/**
 * Open a SOCKS5 connection through the proxy to mxHost:25 and run an SMTP
 * dialog up to RCPT TO for the target address. QUIT cleanly. Never
 * throws.
 *
 * Returns:
 *   { ok: true, accepted: true,  smtpResponse: "250 ..." }
 *   { ok: true, accepted: false, smtpResponse: "550 ..." }
 *   { ok: true, accepted: null,  smtpResponse: "..." }     - inconclusive
 *   { ok: true, greylisted: true, smtpResponse: "4xx ..." }
 *   { ok: false, code, error }
 *
 * SMTP response classification:
 *   2xx after RCPT TO       -> accepted
 *   5xx with "no such user", "user unknown", "mailbox unavailable",
 *           "address rejected", "recipient rejected" -> rejected
 *   4xx                     -> greylist
 *   any other 5xx           -> inconclusive (accepted: null)
 *   timeout / TCP reset     -> ok:false (caller refunds)
 *
 * Block-language detection: if the rejection text mentions block, blacklist,
 * spam policy, etc., we mark the proxy session as blocked so subsequent
 * probes against the same domain rotate to a fresh exit IP.
 */
async function probeMx(mxHost, targetEmail, opts = {}) {
  // ─── Acquire a TCP socket to mxHost:25 ───
  // Two paths:
  //   A. Proxy path (production): SOCKS5 through IPRoyal session
  //   B. Direct path (DEV ONLY): plain net.Socket from this machine's IP
  //
  // Direct mode is gated by EMAIL_VERIFY_ALLOW_DIRECT=true env flag AND
  // only fires when the proxy returns PROXY_NO_CREDENTIALS. Any other
  // proxy error (auth failed, bad port) propagates - the operator made
  // a real config mistake we shouldn't silently paper over.
  const proxyResult = getProxy({
    stickyKey: extractDomain(targetEmail),
    country: opts.country,
  });

  let socket;
  let sessionId;       // null in direct mode - releaseProxy(null) is safe

  if (proxyResult.ok) {
    // ── Path A: proxy connect ──
    const proxy = proxyResult.proxy;
    sessionId = proxy.sessionId;

    let socksConnection;
    try {
      socksConnection = await Promise.race([
        SocksClient.createConnection({
          proxy: {
            host: proxy.host,
            port: proxy.port,
            type: 5,
            userId: proxy.username,
            password: proxy.password,
          },
          command: 'connect',
          destination: { host: mxHost, port: 25 },
          timeout: PROXY_CONNECT_TIMEOUT_MS,
        }),
        timeoutAfter(PROXY_CONNECT_TIMEOUT_MS, 'EMAIL_VERIFY_PROXY_TIMEOUT', 'Proxy connect timed out'),
      ]);
    } catch (err) {
      if (err && err.code === 'EMAIL_VERIFY_PROXY_TIMEOUT') {
        return { ok: false, code: err.code, error: err.message };
      }
      return mapProxyError(err);
    }
    socket = socksConnection.socket;
  } else if (proxyResult.code === 'PROXY_NO_CREDENTIALS' && ALLOW_DIRECT_CONNECT) {
    // ── Path B: direct connect (DEV ONLY) ──
    // No proxy configured AND dev flag enabled - connect directly.
    // Most home ISPs block outbound port 25, so this may fail with
    // ECONNREFUSED/ETIMEDOUT on residential connections. From a VPS or
    // cloud machine it usually works.
    sessionId = null;
    try {
      socket = await connectDirect(mxHost, 25, PROXY_CONNECT_TIMEOUT_MS);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (err && err.code === 'EMAIL_VERIFY_DIRECT_TIMEOUT') {
        return { ok: false, code: err.code, error: msg };
      }
      // ECONNREFUSED on port 25 is the classic ISP-blocks-25 signal.
      // Surface a distinct code so the UI can hint at provisioning IPRoyal.
      if (/ECONNREFUSED/i.test(msg)) {
        return {
          ok: false,
          code: 'EMAIL_VERIFY_DIRECT_BLOCKED',
          error: 'Direct connection refused. Most home ISPs block outbound port 25. Provision IPRoyal or run from a VPS.',
        };
      }
      return {
        ok: false,
        code: 'EMAIL_VERIFY_DIRECT_FAILED',
        error: msg,
      };
    }
  } else {
    // Real proxy config error (auth failed, bad port, missing creds without dev flag).
    return { ok: false, code: proxyResult.code, error: proxyResult.error };
  }

  socket.setNoDelay(true);
  const totalDeadline = Date.now() + SMTP_TOTAL_BUDGET_MS;

  let outcome = 'ok'; // 'ok' | 'block' | 'error' for releaseProxy

  try {
    // Step A: read 220 greeting
    const greeting = await readSmtpResponse(socket, deadlineToMs(totalDeadline));
    if (!greeting.ok) return finishProxyError(socket, sessionId, 'error', greeting.code, greeting.error);
    if (greeting.code3 !== 220) {
      return finish(socket, sessionId, 'error', {
        ok: true, accepted: null, smtpResponse: greeting.line,
      });
    }

    // Step B: EHLO
    await writeLine(socket, `EHLO ${HELO_HOSTNAME}`);
    const ehlo = await readSmtpResponse(socket, deadlineToMs(totalDeadline));
    if (!ehlo.ok) return finishProxyError(socket, sessionId, 'error', ehlo.code, ehlo.error);
    if (ehlo.code3 !== 250) {
      return finish(socket, sessionId, 'error', {
        ok: true, accepted: null, smtpResponse: ehlo.line,
      });
    }

    // Step C: MAIL FROM
    await writeLine(socket, `MAIL FROM:<${FROM_ADDRESS}>`);
    const mailFrom = await readSmtpResponse(socket, deadlineToMs(totalDeadline));
    if (!mailFrom.ok) return finishProxyError(socket, sessionId, 'error', mailFrom.code, mailFrom.error);
    if (mailFrom.code3 >= 400 && mailFrom.code3 < 500) {
      // Greylist on MAIL FROM is rare but possible
      return finish(socket, sessionId, 'error', {
        ok: true, greylisted: true, smtpResponse: mailFrom.line,
      });
    }
    if (mailFrom.code3 !== 250) {
      // Server rejected our MAIL FROM. This usually means the proxy IP is
      // blacklisted by the destination. Mark the session and bail.
      if (looksLikeBlock(mailFrom.line)) outcome = 'block';
      return finish(socket, sessionId, outcome, {
        ok: true, accepted: null, smtpResponse: mailFrom.line,
      });
    }

    // Step D: RCPT TO (the actual question)
    await writeLine(socket, `RCPT TO:<${targetEmail}>`);
    const rcpt = await readSmtpResponse(socket, deadlineToMs(totalDeadline));
    if (!rcpt.ok) return finishProxyError(socket, sessionId, 'error', rcpt.code, rcpt.error);

    // Try to QUIT cleanly. Don't care if it fails.
    writeLine(socket, 'QUIT').catch(() => {});

    if (rcpt.code3 >= 200 && rcpt.code3 < 300) {
      return finish(socket, sessionId, 'ok', {
        ok: true, accepted: true, smtpResponse: rcpt.line,
      });
    }
    if (rcpt.code3 >= 400 && rcpt.code3 < 500) {
      return finish(socket, sessionId, 'ok', {
        ok: true, greylisted: true, smtpResponse: rcpt.line,
      });
    }
    if (rcpt.code3 >= 500 && rcpt.code3 < 600) {
      if (looksLikeReject(rcpt.line)) {
        return finish(socket, sessionId, 'ok', {
          ok: true, accepted: false, smtpResponse: rcpt.line,
        });
      }
      if (looksLikeBlock(rcpt.line)) {
        outcome = 'block';
        return finish(socket, sessionId, outcome, {
          ok: true, accepted: null, smtpResponse: rcpt.line,
        });
      }
      // Some other 5xx we can't confidently classify
      return finish(socket, sessionId, 'ok', {
        ok: true, accepted: null, smtpResponse: rcpt.line,
      });
    }

    // Anything else: inconclusive
    return finish(socket, sessionId, 'ok', {
      ok: true, accepted: null, smtpResponse: rcpt.line,
    });

  } catch (err) {
    return finishProxyError(socket, sessionId, 'error',
      'EMAIL_VERIFY_DIALOG_ERROR',
      err && err.message ? err.message : String(err));
  }
}

/**
 * Direct TCP connect to host:port without going through a proxy. DEV ONLY -
 * see ALLOW_DIRECT_CONNECT note above for why this should never run in
 * production.
 *
 * Returns a connected net.Socket on success, throws on failure. The error
 * may carry .code = 'EMAIL_VERIFY_DIRECT_TIMEOUT' for the timeout case;
 * other errors are passed through (ECONNREFUSED, EHOSTUNREACH, etc.).
 *
 * Why a manual race instead of net.createConnection's built-in timeout?
 * The 'timeout' event on net.Socket only fires if no data is received,
 * not if the connect handshake stalls indefinitely on a dropped SYN.
 * A wall-clock race is the only reliable upper bound.
 */
function connectDirect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      const err = new Error(`Direct connect to ${host}:${port} timed out after ${timeoutMs}ms`);
      err.code = 'EMAIL_VERIFY_DIRECT_TIMEOUT';
      reject(err);
    }, timeoutMs);

    const socket = net.createConnection({ host, port, family: 0 }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch {}
      reject(err);
    });
  });
}

function deadlineToMs(deadline) {
  return Math.max(1, Math.min(SMTP_STEP_TIMEOUT_MS, deadline - Date.now()));
}

function finish(socket, sessionId, outcome, payload) {
  try { socket.end(); } catch {}
  releaseProxy(sessionId, outcome);
  return payload;
}

function finishProxyError(socket, sessionId, outcome, code, error) {
  try { socket.destroy(); } catch {}
  releaseProxy(sessionId, outcome);
  return { ok: false, code, error };
}

function mapProxyError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/auth/i.test(msg))                 return { ok: false, code: 'EMAIL_VERIFY_PROXY_AUTH',    error: 'Proxy authentication failed' };
  if (/refused/i.test(msg))              return { ok: false, code: 'EMAIL_VERIFY_PROXY_REFUSED', error: 'Proxy refused destination' };
  if (/host unreachable/i.test(msg))     return { ok: false, code: 'EMAIL_VERIFY_HOST_UNREACH',  error: 'Destination unreachable' };
  if (/network unreachable/i.test(msg))  return { ok: false, code: 'EMAIL_VERIFY_NET_UNREACH',   error: 'Network unreachable' };
  if (/timeout/i.test(msg))              return { ok: false, code: 'EMAIL_VERIFY_PROXY_TIMEOUT', error: 'Proxy timeout' };
  return { ok: false, code: 'EMAIL_VERIFY_PROXY_FAILED', error: 'Proxy connection failed' };
}

function looksLikeReject(line) {
  if (!line) return false;
  return /no such user|user unknown|recipient rejected|mailbox unavailable|address rejected|user not found|does not exist|not a valid recipient|invalid recipient|relay denied/i.test(line);
}

function looksLikeBlock(line) {
  if (!line) return false;
  return /\bblock(ed|list|listed)?\b|spam policy|reputation|access denied|connection refused|unsolicited|rejected by policy|too many connections|spamhaus|barracuda|sorbs/i.test(line);
}

function extractDomain(email) {
  const at = email.indexOf('@');
  return at === -1 ? email : email.slice(at + 1);
}

// ============================================================================
// Low-level SMTP I/O on a raw socket
// ============================================================================

/**
 * Read until a final SMTP response line arrives. SMTP uses "250-FOO" for
 * continuation lines and "250 FOO" (note the space) for the last line.
 * Returns the joined response and the parsed 3-digit code.
 *
 * Returns:
 *   { ok: true, line: string, code3: number }
 *   { ok: false, code, error }
 */
function readSmtpResponse(socket, timeoutMs) {
  return new Promise((resolve) => {
    let buffer = '';
    const lines = [];

    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, code: 'EMAIL_VERIFY_TIMEOUT', error: 'SMTP response timed out' });
    }, timeoutMs);

    function onData(chunk) {
      buffer += chunk.toString('utf-8');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        lines.push(line);
        // Final line: "NNN<space>..."
        if (/^\d{3} /.test(line)) {
          cleanup();
          const joined = lines.join(' ').trim();
          const m = joined.match(/^(\d{3})/);
          resolve({
            ok: true,
            line: joined.slice(0, 500),
            code3: m ? parseInt(m[1], 10) : 0,
          });
          return;
        }
      }
    }

    function onError(err) {
      cleanup();
      resolve({
        ok: false,
        code: 'EMAIL_VERIFY_SOCKET_ERROR',
        error: err && err.message ? err.message : String(err),
      });
    }

    function onClose() {
      cleanup();
      if (lines.length > 0) {
        const joined = lines.join(' ').trim();
        const m = joined.match(/^(\d{3})/);
        resolve({
          ok: true,
          line: joined.slice(0, 500),
          code3: m ? parseInt(m[1], 10) : 0,
        });
      } else {
        resolve({
          ok: false,
          code: 'EMAIL_VERIFY_CLOSED_EARLY',
          error: 'Connection closed before SMTP response',
        });
      }
    }

    function cleanup() {
      clearTimeout(timer);
      socket.off('data',  onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    }

    socket.on('data',  onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

function writeLine(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(line + '\r\n', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function timeoutAfter(ms, code, message) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const e = new Error(message);
      e.code = code;
      reject(e);
    }, ms);
  });
}
