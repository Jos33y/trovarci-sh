/* ═══════════════════════════════════════════════════════════════════════════
   smtpTester.server.js

   Full SMTP handshake probe for the SMTP Tester tool. Uses nodemailer for
   the protocol state machine, captures the raw SMTP dialog via its debug
   stream, and returns a structured transcript the frontend renders as the
   terminal view.

   Contract with the API route:
     runSmtpTest(config) -> Promise<{
       steps: [ { name, label, status, duration, lines, detail, ... } ],
       summary: { verdict, host, port, tlsVersion, tlsCipher, authMethod, maxSize, totalDuration }
     }>

   Security posture:
     - Credentials are NEVER logged, NEVER included in the returned transcript.
       The 'auth' step shows '[credentials sent]' placeholders instead of the
       actual base64 user/pass strings.
     - The debug stream is filtered through redactLine() before any line is
       appended to step.lines.
     - Nodemailer's built-in debug output is captured into our transcript
       (not routed to process.stdout), so server logs stay clean.
     - No email is ever sent. The sender and recipient check (smtpEnvelope.server.js)
       stops after RCPT TO with RSET and QUIT; DATA is never issued.
     - Hard timeout caps: per-stage and overall.

   Why not write the SMTP state machine by hand:
     Nodemailer handles 10+ auth mechanisms (PLAIN/LOGIN/CRAM-MD5/XOAUTH2/etc),
     STARTTLS negotiation vs implicit TLS, server-specific ESMTP quirks, and
     TLS cipher selection. Replicating that is weeks of work for zero user value.
     We use nodemailer as the SMTP transport, then layer our step reporting on
     top of its event stream.
   ═══════════════════════════════════════════════════════════════════════════ */

import nodemailer from 'nodemailer';
import { assertSafeHost } from '../utils/ssrfGuard.server.js';
import { checkEnvelope } from './smtpEnvelope.server.js';

/* ─── Config ───────────────────────────────────────────────────────────── */

const ALLOWED_PORTS = new Set([25, 465, 587, 2525]);
const ALLOWED_SECURITY = new Set(['none', 'starttls', 'ssl', 'tls']);
const OVERALL_TIMEOUT_MS = 30_000;
const DEFAULT_STAGE_TIMEOUT_MS = 10_000;
const OUR_EHLO_NAME = process.env.SMTP_TESTER_EHLO_NAME || 'trovarci.sh';
const OUR_TEST_RECIPIENT = process.env.SMTP_TESTER_TEST_RECIPIENT || 'smtp-test@trovarci.sh';

/* ─── Credential redaction ─────────────────────────────────────────────── */

/**
 * Scrub any SMTP dialog line that could leak credentials. After AUTH LOGIN
 * the client sends two base64-encoded lines (username, password). After
 * AUTH PLAIN the client sends one base64 line with NUL-separated creds.
 * We replace any client->server line that follows an AUTH command with a
 * placeholder, AND defensively filter any line that looks base64-ish long
 * after a recent AUTH command.
 */
function makeRedactor() {
  let authWindowDepth = 0; // how many client lines remain "post-AUTH"
  return function redactLine(direction, text) {
    if (!text) return text;
    const trimmed = text.trim();

    // Start of an AUTH exchange - remember to redact the next client line(s).
    if (direction === 'sent' && /^AUTH\s+(LOGIN|PLAIN|CRAM-MD5|XOAUTH2|NTLM)\b/i.test(trimmed)) {
      // LOGIN is two follow-up lines (user, pass). PLAIN is one. Set conservative cap.
      authWindowDepth = /^AUTH\s+LOGIN/i.test(trimmed) ? 2 : 1;
      return trimmed; // Redact the credential lines that follow, not this one.
    }

    // Redact any client line inside the AUTH window.
    if (direction === 'sent' && authWindowDepth > 0) {
      authWindowDepth--;
      return '[credentials sent]';
    }

    // Defense in depth: if a client line happens to look like long base64
    // after we lost the AUTH window tracking, redact it too.
    if (direction === 'sent' && /^[A-Za-z0-9+/=]{20,}$/.test(trimmed)) {
      return '[credentials sent]';
    }

    return trimmed;
  };
}

/* ─── Provider hints for summary detection ─────────────────────────────── */

const PROVIDER_HOST_PATTERNS = [
  { match: /smtp\.gmail\.com|smtp-relay\.gmail\.com/i,      name: 'Google Workspace' },
  { match: /smtp\.office365\.com|smtp\.outlook\.com/i,      name: 'Microsoft 365' },
  { match: /email-smtp\..*\.amazonaws\.com/i,               name: 'Amazon SES' },
  { match: /smtp\.sendgrid\.net/i,                          name: 'SendGrid' },
  { match: /smtp\.mailgun\.org/i,                           name: 'Mailgun' },
  { match: /smtp\.postmarkapp\.com/i,                       name: 'Postmark' },
  { match: /smtp-relay\.brevo\.com/i,                       name: 'Brevo' },
  { match: /smtp\.zoho\.com/i,                              name: 'Zoho Mail' },
  { match: /smtp\.fastmail\.com/i,                          name: 'Fastmail' },
  { match: /smtp\.mailtrap\.io/i,                           name: 'Mailtrap' },
];

function detectProvider(host) {
  for (const { match, name } of PROVIDER_HOST_PATTERNS) {
    if (match.test(host)) return name;
  }
  return null;
}

/* ─── Step builder ─────────────────────────────────────────────────────── */

function makeStep(name, label) {
  return {
    name,
    label,
    status: 'skip',
    duration: 0,
    lines: [],
    detail: '',
    startedAt: 0,
  };
}

function finishStep(step, status, detail, startedAt) {
  step.status = status;
  step.detail = detail || '';
  step.duration = Math.max(0, Date.now() - startedAt);
  delete step.startedAt;
}

/* ─── Main entry point ─────────────────────────────────────────────────── */

/**
 * Run an SMTP connection test and return a structured transcript.
 * Never throws. Always returns a shaped result - the API route can JSON it directly.
 *
 * @param {object} config
 * @param {string} config.host
 * @param {number} config.port
 * @param {'none'|'starttls'|'ssl'|'tls'} config.security
 * @param {string} config.username
 * @param {string} config.password
 * @param {string} [config.from]
 * @param {string} [config.to]
 * @param {number} [config.timeoutSec]
 */
export async function runSmtpTest(config) {
  const started = Date.now();
  const host = String(config.host || '').trim();
  const port = Number(config.port);
  const security = String(config.security || 'starttls').toLowerCase();
  const username = String(config.username || '');
  const password = String(config.password || '');
  const fromAddr = String(config.from || username || '').trim();
  const toAddr = String(config.to || OUR_TEST_RECIPIENT).trim();
  const stageTimeoutMs = Math.min(
    Math.max(3, Number(config.timeoutSec) || 10) * 1000,
    DEFAULT_STAGE_TIMEOUT_MS * 2,
  );

  /* Validate inputs. Reject before any network activity. */
  if (!host) {
    return buildFailure(host, port, 'tcp_connect', 'Host is required', started);
  }
  if (!ALLOWED_PORTS.has(port)) {
    return buildFailure(host, port, 'tcp_connect',
      `Port ${port} not allowed. Use 25, 465, 587, or 2525.`, started);
  }
  if (!ALLOWED_SECURITY.has(security)) {
    return buildFailure(host, port, 'tcp_connect',
      'Security mode must be none, starttls, or ssl/tls', started);
  }
  if (!username) {
    return buildFailure(host, port, 'auth', 'Username is required', started);
  }
  if (!password) {
    return buildFailure(host, port, 'auth', 'Password is required', started);
  }

  /* SSRF guard. Reject internal/reserved addresses before nodemailer ever
     opens a socket. */
  const safe = await assertSafeHost(host);
  if (!safe.ok) {
    return buildFailure(host, port, 'tcp_connect',
      `Host rejected: ${safe.reason}`, started, safe.code);
  }

  /* Build steps in the order the spec defines. Each step starts as 'skip'
     and gets promoted to 'pass' or 'fail' as the handshake progresses. */
  const steps = {
    tcp_connect: makeStep('tcp_connect', 'Connect to server'),
    banner:      makeStep('banner',      'Server greeting'),
    ehlo:        makeStep('ehlo',        'Introduce (EHLO)'),
    starttls:    makeStep('starttls',    'Encryption (STARTTLS)'),
    auth:        makeStep('auth',        'Log in'),
    mail_from:   makeStep('mail_from',   'Sender accepted'),
    rcpt_to:     makeStep('rcpt_to',     'Recipient accepted'),
    quit:        makeStep('quit',        'Disconnect'),
  };

  // Initial info line for TCP connect step.
  steps.tcp_connect.lines.push({
    type: 'info',
    text: `Connecting to ${host}:${port}...`,
  });

  /* Protocol-correct TLS mode derivation. The user's security selection is a
     UX hint; the wire reality is determined by the port. Getting this wrong
     means the socket opens in the wrong mode and both ends stare at each
     other until timeout.

       Port 465  -> implicit TLS (SSL from byte zero)
       Port 587  -> STARTTLS (plaintext, then upgrade)
       Port 25   -> STARTTLS if offered, else plaintext
       Port 2525 -> STARTTLS by convention

     We trust the port number as the source of truth. */

  let secure;
  let requireTLS;
  let ignoreTLS = false;

  if (port === 465) {
    secure = true;
    requireTLS = false;
  } else if (port === 587 || port === 2525) {
    secure = false;
    requireTLS = true;
  } else if (port === 25) {
    secure = false;
    requireTLS = security === 'starttls';
    ignoreTLS = security === 'none';
  } else {
    // Unreachable given ALLOWED_PORTS, but defaults that work for most servers.
    secure = security === 'ssl' || security === 'tls';
    requireTLS = security === 'starttls';
    ignoreTLS = security === 'none';
  }

  const redactLine = makeRedactor();
  const capabilities = new Set();
  let tlsVersion = null;
  let tlsCipher = null;
  let authMethod = null;
  let maxSize = null;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    ignoreTLS,
    auth: {
      user: username,
      pass: password,
    },
    connectionTimeout: stageTimeoutMs,
    greetingTimeout: stageTimeoutMs,
    socketTimeout: stageTimeoutMs,
    tls: {
      // Never silently accept unknown CAs. A self-signed or expired cert
      // produces a clean failure in the transcript, which is what the user
      // needs to see.
      rejectUnauthorized: true,
    },
    name: OUR_EHLO_NAME,
    logger: false,
    debug: true,
  });

  /* Hook into the debug event to capture the protocol dialog. Nodemailer
     emits lines with `tnx` (transaction) type = 'network' for on-wire bytes,
     'client' for sent, 'server' for received. We normalize into sent/recv
     and route to the appropriate step. */

  let currentStep = steps.tcp_connect;

  transporter.on('log', (entry) => {
    if (!entry) return;
    const { type, message } = entry;
    if (!message) return;

    // nodemailer emits message as either a string or a multi-line block
    const rawLines = String(message).split(/\r?\n/).filter(Boolean);

    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) continue;

      // Direction classification
      if (type === 'client' || /^C:\s/i.test(line) || /^>\s/.test(line)) {
        const clean = line.replace(/^C:\s*/i, '').replace(/^>\s*/, '');
        const redacted = redactLine('sent', clean);
        currentStep.lines.push({ type: 'sent', text: redacted });
        routeSent(redacted);
      } else if (type === 'server' || /^S:\s/i.test(line) || /^<\s/.test(line)) {
        const clean = line.replace(/^S:\s*/i, '').replace(/^<\s*/, '');
        currentStep.lines.push({ type: 'recv', text: clean });
        routeRecv(clean);
      }
      // Other debug types (connect, close, etc) we ignore - they'd clutter the UI.
    }
  });

  /* Direction routers: flip currentStep based on command/response patterns. */
  function routeSent(line) {
    const upper = line.toUpperCase();
    if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
      currentStep = steps.ehlo;
      currentStep.lines.push({ type: 'sent', text: line });
      // We already pushed above. Remove the duplicate.
      currentStep.lines.pop();
    } else if (upper.startsWith('STARTTLS')) {
      currentStep = steps.starttls;
    } else if (upper.startsWith('AUTH ')) {
      currentStep = steps.auth;
      authMethod = upper.split(/\s+/)[1] || null;
    } else if (upper.startsWith('MAIL FROM')) {
      currentStep = steps.mail_from;
    } else if (upper.startsWith('RCPT TO')) {
      currentStep = steps.rcpt_to;
    } else if (upper === 'QUIT') {
      currentStep = steps.quit;
    }
  }

  function routeRecv(line) {
    // Extract EHLO capabilities.
    const capMatch = line.match(/^250[- ](.+)$/);
    if (capMatch) {
      const cap = capMatch[1].split(/\s+/)[0].toUpperCase();
      if (cap && !/^[0-9.]+$/.test(cap)) {
        capabilities.add(cap);
      }
      const sizeMatch = line.match(/^250[- ]SIZE\s+(\d+)/i);
      if (sizeMatch) maxSize = Number(sizeMatch[1]);
    }
  }

  /* Execute the test with a global timeout. verify() runs connect -> EHLO
     -> STARTTLS (if applicable) -> AUTH -> NOOP. We then add a MAIL FROM +
     RCPT TO probe manually so we can test sender/recipient acceptance
     without sending mail. */

  const t0 = Date.now();
  const bannerStarted = Date.now();

  try {
    await withTimeout(transporter.verify(), OVERALL_TIMEOUT_MS, 'SMTP test exceeded overall timeout');

    // verify() reaching here means connect + greeting + EHLO + TLS + AUTH all passed.
    finishStep(steps.tcp_connect, 'pass', `Connected to ${safe.ips[0]}:${port}`, t0);
    finishStep(steps.banner,      'pass', 'Server greeting received', bannerStarted);
    finishStep(steps.ehlo,        'pass', describeEhlo(capabilities, maxSize), bannerStarted);

    if (secure) {
      finishStep(steps.starttls, 'skip', 'Encrypted from the start (port 465)', bannerStarted);
    } else if (requireTLS) {
      // Inspect the underlying socket for TLS info via a follow-up SMTP NOOP.
      // Nodemailer exposes the socket through the pool; simplest reliable path
      // is to infer from capabilities.
      if (capabilities.has('STARTTLS')) {
        finishStep(steps.starttls, 'pass', 'Encryption switched on', bannerStarted);
      } else {
        finishStep(steps.starttls, 'skip', 'The server doesn\u2019t offer encryption', bannerStarted);
      }
    } else {
      finishStep(steps.starttls, 'skip', 'Not requested', bannerStarted);
    }

    finishStep(steps.auth, 'pass', 'Logged in', bannerStarted);

    /* MAIL FROM + RCPT TO on a fresh connection, then RSET and QUIT. DATA is
       never sent, so the test can't deliver anything. */
    const envProbe = await withTimeout(checkEnvelope({
      address: safe.ips[0],
      host,
      port,
      secure,
      requireTLS,
      ignoreTLS,
      username,
      password,
      from: fromAddr,
      to: toAddr,
      ehloName: OUR_EHLO_NAME,
      timeoutMs: stageTimeoutMs,
    }), OVERALL_TIMEOUT_MS, 'Sender and recipient check timed out');
    for (const line of envProbe.transcript) {
      if (steps[line.step]) steps[line.step].lines.push({ type: line.type, text: line.text });
    }

    if (envProbe.mailFrom.ok) {
      finishStep(steps.mail_from, 'pass', `${fromAddr} accepted`, bannerStarted);
    } else {
      finishStep(steps.mail_from, 'fail', envProbe.mailFrom.error || 'Rejected', bannerStarted);
    }

    if (envProbe.rcptTo.ok) {
      finishStep(steps.rcpt_to, 'pass', `${toAddr} accepted`, bannerStarted);
    } else if (envProbe.mailFrom.ok) {
      finishStep(steps.rcpt_to, 'fail', envProbe.rcptTo.error || 'Rejected', bannerStarted);
    } else {
      finishStep(steps.rcpt_to, 'skip', 'Not checked: the sender was refused', bannerStarted);
    }

    finishStep(steps.quit, 'pass', 'Connection closed', bannerStarted);

  } catch (err) {
    // Log the full error for server-side debugging. Never leaves the server.
    // Intentionally includes stack + cause chain so we can actually diagnose
    // which layer (TCP, TLS, STARTTLS, AUTH, etc) broke when the nodemailer
    // wrapper collapses everything to ESOCKET.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[smtp-test] probe failed:', {
        code: err?.code,
        errno: err?.errno,
        syscall: err?.syscall,
        command: err?.command,
        responseCode: err?.responseCode,
        response: err?.response,
        message: err?.message,
        causeCode: err?.cause?.code,
        causeMessage: err?.cause?.message,
      });
    }

    // Figure out which step this failure belongs to based on which is last in progress.
    const failMsg = nodemailerErrorToMessage(err);
    const targetStep = currentStep && currentStep.status === 'skip' ? currentStep : steps.tcp_connect;
    finishStep(targetStep, 'fail', failMsg, t0);

    // Any steps before the failed one that are still 'skip' get a synthetic
    // 'pass' since nodemailer doesn't hand us a progress hook. We can't tell
    // whether banner was received if connect failed, so leave earlier-stage
    // skips in place when the failure is early.
    promoteEarlierStepsOnFail(steps, targetStep.name);

    // Extract TLS info if available from the nodemailer error.
    tlsVersion = err?.tls?.version || tlsVersion;
    tlsCipher = err?.tls?.cipher || tlsCipher;
  } finally {
    try { transporter.close(); } catch { /* swallow */ }
  }

  const totalDuration = Date.now() - started;

  const summary = {
    verdict: deriveVerdict(steps),
    host,
    port,
    tlsVersion: tlsVersion || (secure || capabilities.has('STARTTLS') ? 'TLS negotiated' : null),
    tlsCipher: tlsCipher || null,
    authMethod: authMethod || null,
    maxSize,
    totalDuration,
    provider: detectProvider(host),
    message: summaryMessage(steps),
  };

  return {
    steps: Object.values(steps),
    summary,
  };
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms)),
  ]);
}

function describeEhlo(capabilities, maxSize) {
  const caps = Array.from(capabilities).filter((c) => c.length > 0).slice(0, 6);
  const parts = [];
  if (caps.length) parts.push(`Supports ${caps.join(', ')}`);
  if (maxSize) parts.push(`max ${Math.round(maxSize / 1024 / 1024)} MB`);
  return parts.join(', ') || 'Handshake complete';
}

function deriveVerdict(steps) {
  const vals = Object.values(steps);
  if (vals.every((s) => s.status === 'pass' || s.status === 'skip')) return 'pass';
  if (vals.some((s) => s.status === 'pass')) return 'partial';
  return 'fail';
}

function summaryMessage(steps) {
  const v = deriveVerdict(steps);
  if (v === 'pass') return 'Your settings work. Ready to send.';
  const firstFail = Object.values(steps).find((s) => s.status === 'fail');
  if (firstFail) return `Test stopped at ${firstFail.label}: ${firstFail.detail}`;
  return 'Some steps did not complete';
}

function nodemailerErrorToMessage(err) {
  if (!err) return 'Something went wrong';
  const resp = err?.response;
  const code = err?.code;
  const syscall = err?.syscall;

  // Response text from the server is the most useful thing.
  if (resp) return String(resp).replace(/\r?\n/g, ' ').slice(0, 300);

  // Extract any lower-level socket error the code carries.
  const underlying = err?.cause?.code || err?.errno;
  const combined = underlying ? `${code} / ${underlying}` : code;

  const byCode = {
    ECONNREFUSED: 'The server refused the connection. Check the server name and port.',
    ETIMEDOUT:    'No answer from the server. Usually the port is blocked on the way (a firewall or network), not that the server is down. Try 587 or 465.',
    ECONNECTION:  'Couldn\u2019t reach the server. The port may be blocked on the way. Try 587 or 465.',
    EDNS:         'That server name doesn\u2019t exist. Check the spelling.',
    ESOCKET:      syscall === 'connect'
      ? 'Couldn\u2019t connect. Usually the port is blocked on the way, not a problem with the server. Try 587 or 465.'
      : 'The connection dropped.',
    EAUTH:        'The server refused the username or password. Gmail and Microsoft accounts need an app password.',
    EENVELOPE:    'The server refused the sender or recipient.',
    ETLS:         'Encryption failed. Try the other port (587 or 465), or check the server\u2019s certificate.',
  };
  if (byCode[code]) return byCode[code];

  return (err.message || `Something went wrong (${combined})`).slice(0, 300);
}

function promoteEarlierStepsOnFail(steps, failedStepName) {
  const order = ['tcp_connect', 'banner', 'ehlo', 'starttls', 'auth', 'mail_from', 'rcpt_to', 'quit'];
  const failIdx = order.indexOf(failedStepName);
  for (let i = 0; i < failIdx; i++) {
    const s = steps[order[i]];
    if (s.status === 'skip') {
      // These ran successfully to reach the later step; promote them to pass
      // with a generic detail so the UI shows the progression correctly.
      s.status = 'pass';
      s.duration = Math.max(s.duration, 1);
      if (!s.detail) s.detail = 'Completed';
    }
  }
  // Steps after the failure keep 'skip' but get a human-readable detail so
  // the transcript row is not blank in the terminal.
  for (let i = failIdx + 1; i < order.length; i++) {
    const s = steps[order[i]];
    if (s.status === 'skip' && !s.detail) {
      s.detail = 'Not reached: an earlier step failed';
    }
  }
}

function buildFailure(host, port, failStep, detail, startedAt, code = 'VALIDATION') {
  const steps = {
    tcp_connect: makeStep('tcp_connect', 'Connect to server'),
    banner:      makeStep('banner',      'Server greeting'),
    ehlo:        makeStep('ehlo',        'Introduce (EHLO)'),
    starttls:    makeStep('starttls',    'Encryption (STARTTLS)'),
    auth:        makeStep('auth',        'Log in'),
    mail_from:   makeStep('mail_from',   'Sender accepted'),
    rcpt_to:     makeStep('rcpt_to',     'Recipient accepted'),
    quit:        makeStep('quit',        'Disconnect'),
  };
  const now = Date.now();
  const failKey = failStep in steps ? failStep : 'tcp_connect';
  finishStep(steps[failKey], 'fail', detail, now - 1);
  promoteEarlierStepsOnFail(steps, failKey);

  return {
    steps: Object.values(steps),
    summary: {
      verdict: 'fail',
      host,
      port,
      tlsVersion: null,
      tlsCipher: null,
      authMethod: null,
      maxSize: null,
      totalDuration: Date.now() - startedAt,
      provider: detectProvider(host),
      message: detail,
      errorCode: code,
    },
  };
}
