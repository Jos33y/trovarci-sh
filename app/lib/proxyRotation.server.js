/* ═══════════════════════════════════════════════════════════════════════════
   proxyRotation.server.js

   Provider-agnostic proxy rotation for SMTP probes. Without rotation, our
   server's outbound IP would be blacklisted by Gmail / Outlook / Office365
   / Yahoo within hours of running production-scale verifications.

   Why SOCKS5 specifically:
     SMTP runs on port 25. HTTP CONNECT proxies on most providers default
     to ports 80/443 only. SOCKS5 supports arbitrary destination ports out
     of the box. IPRoyal, BrightData, Smartproxy all expose SOCKS5
     endpoints for their datacenter and ISP plans.

   Provider abstraction:
     The exported interface (getProxy, releaseProxy, markBlocked,
     getHealth) is provider-neutral. The IPRoyal-specific username
     formatting lives in buildIpRoyalUsername() and can be swapped by
     setting PROXY_PROVIDER to a different value once that provider's
     adapter is added.

   Sticky sessions:
     A single MX conversation (greeting -> EHLO -> MAIL FROM -> RCPT TO ->
     QUIT) must complete on the same proxy IP. If the IP changed mid-
     dialog the receiving server would treat each command as a fresh
     connection and the protocol breaks. We achieve stickiness by deriving
     a session id from the destination domain and including it in the
     proxy username.

     Session lifetime: 10 minutes default. Long enough for any reasonable
     SMTP dialog (which usually finishes in 1-2 seconds). Short enough
     that we naturally rotate IPs across hours of work.

   In-process block tracking:
     If a proxy IP gets blocked by a destination MX, we cache that fact
     locally for 30 minutes and avoid that session id during the block
     window. This is per-process state - it resets on worker restart.
     That's fine; the destination's block also lifts eventually, and
     fresh sessions get fresh IPs anyway.

     When we run multiple workers, each worker maintains its own block
     map. Two workers can briefly hit the same blocked IP through
     different sessions. Acceptable: the blocks are usually short-term,
     and a centralised block table would add cross-worker coordination
     overhead for marginal gain.

   Configuration via env (.env.email_verifier.fragment):
     PROXY_PROVIDER         iproyal|smartproxy|brightdata (default iproyal)
     PROXY_HOST             default geo.iproyal.com
     PROXY_PORT             default 32325 (IPRoyal SOCKS5)
     PROXY_USERNAME         IPRoyal username
     PROXY_PASSWORD         IPRoyal password
     PROXY_SESSION_LIFETIME_MIN   default 10
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_HOST = 'geo.iproyal.com';
const DEFAULT_PORT = 32325;
const DEFAULT_LIFETIME_MIN = 10;
const BLOCK_DURATION_MS = 30 * 60 * 1000;
const KNOWN_PROVIDERS = new Set(['iproyal', 'smartproxy', 'brightdata']);

const _blockedSessions = new Map(); // sessionId -> blockedAt epoch ms
const _statsCounters = {
  proxiesIssued: 0,
  blocksRecorded: 0,
  blocksExpired: 0,
};

/**
 * Get a proxy connection descriptor.
 *
 * Returns:
 *   { ok: true, proxy: { type, host, port, username, password, sessionId } }
 *   { ok: false, code, error }
 *
 * @param {object} [opts]
 * @param {string} [opts.stickyKey] - any string. Same key in the same
 *   lifetime window returns the same session id (and therefore the same
 *   exit IP). Use the destination domain so the SMTP dialog stays
 *   coherent.
 * @param {string} [opts.country] - 2-letter ISO code. Forces the proxy to
 *   exit in that country. Useful for verifying email domains that
 *   geo-block non-local senders. Optional.
 * @param {number} [opts.lifetimeMin] - override session lifetime in
 *   minutes. Default 10.
 */
export function getProxy(opts = {}) {
  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;
  if (!username || !password) {
    return {
      ok: false,
      code: 'PROXY_NO_CREDENTIALS',
      error: 'Proxy is not configured. Set PROXY_USERNAME and PROXY_PASSWORD.',
    };
  }

  const provider = (process.env.PROXY_PROVIDER || 'iproyal').toLowerCase();
  if (!KNOWN_PROVIDERS.has(provider)) {
    return {
      ok: false,
      code: 'PROXY_UNKNOWN_PROVIDER',
      error: `Unsupported PROXY_PROVIDER: ${provider}`,
    };
  }

  const host = process.env.PROXY_HOST || DEFAULT_HOST;
  const portRaw = process.env.PROXY_PORT;
  const port = portRaw ? parseInt(portRaw, 10) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      code: 'PROXY_BAD_PORT',
      error: `PROXY_PORT must be a valid TCP port, got: ${portRaw}`,
    };
  }

  const lifetimeFromEnv = parseInt(process.env.PROXY_SESSION_LIFETIME_MIN || '', 10);
  const lifetimeMin = Number.isFinite(opts.lifetimeMin) && opts.lifetimeMin > 0
    ? Math.floor(opts.lifetimeMin)
    : (Number.isFinite(lifetimeFromEnv) && lifetimeFromEnv > 0 ? lifetimeFromEnv : DEFAULT_LIFETIME_MIN);

  // Cleanup expired blocks before picking a session id
  cleanupExpiredBlocks();

  // Pick a session id. Sticky if requested, otherwise random.
  let sessionId;
  if (opts.stickyKey) {
    sessionId = buildStickySessionId(opts.stickyKey, lifetimeMin);
    // If this sticky session is blocked, fall back to a fresh random session
    // for this attempt. Next attempt to the same domain will retry the sticky
    // path (the block expires on its own).
    if (_blockedSessions.has(sessionId)) {
      sessionId = randomSessionId();
    }
  } else {
    sessionId = randomSessionId();
  }

  const formattedUsername = buildUsername(provider, {
    username,
    sessionId,
    country: typeof opts.country === 'string' ? opts.country.toLowerCase() : null,
    lifetimeMin,
  });

  _statsCounters.proxiesIssued++;

  return {
    ok: true,
    proxy: {
      type: 'socks5',
      host,
      port,
      username: formattedUsername,
      password,
      sessionId,
    },
  };
}

/**
 * Mark a session as blocked. Subsequent getProxy() calls with the same
 * stickyKey within the block window will rotate to a fresh random
 * session.
 *
 * Reasons we mark blocked:
 *   - SMTP server returned 5xx with rejection language ("blocked",
 *     "blacklisted", "spam policy")
 *   - Repeated connection refused / timeouts on the same session
 *   - Proxy itself reported failure (rare)
 */
export function markBlocked(sessionId, reason) {
  if (typeof sessionId !== 'string' || !sessionId) return;
  const wasNew = !_blockedSessions.has(sessionId);
  _blockedSessions.set(sessionId, Date.now());
  if (wasNew) _statsCounters.blocksRecorded++;
  // Reason is captured here for diagnostics; if you want centralized
  // logging, hook it up here. Intentionally not console.log'd to avoid
  // leaking session ids into shipped log streams.
}

/**
 * Release a proxy back to the pool. The 'outcome' tells us how the
 * conversation went so we can update the block map.
 *
 * @param {string} sessionId
 * @param {'ok'|'block'|'error'} outcome
 *   'ok'    - everything worked, no action
 *   'block' - destination rejected us with block-language; mark blocked
 *   'error' - infrastructure error (timeout, TCP reset). Not blocked, but
 *             the worker may want to back off.
 */
export function releaseProxy(sessionId, outcome) {
  if (outcome === 'block') markBlocked(sessionId, 'release-block');
  // 'ok' and 'error' do not affect the block map
}

/**
 * Return health/diagnostics. Used by the worker /health endpoint and any
 * future ops dashboard.
 */
export function getHealth() {
  cleanupExpiredBlocks();
  return {
    hasCredentials: !!(process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD),
    provider: (process.env.PROXY_PROVIDER || 'iproyal').toLowerCase(),
    host: process.env.PROXY_HOST || DEFAULT_HOST,
    port: parseInt(process.env.PROXY_PORT || String(DEFAULT_PORT), 10),
    blockedSessions: _blockedSessions.size,
    counters: { ..._statsCounters },
  };
}

/**
 * Test-only helper. Resets the in-process block map. NOT exposed to
 * runtime code paths - the block map is per-process state and clearing
 * it from runtime would defeat its purpose.
 */
export function _resetForTests() {
  _blockedSessions.clear();
  _statsCounters.proxiesIssued = 0;
  _statsCounters.blocksRecorded = 0;
  _statsCounters.blocksExpired = 0;
}

/* ─── Internals ────────────────────────────────────────────────────────── */

function cleanupExpiredBlocks() {
  const now = Date.now();
  for (const [sid, blockedAt] of _blockedSessions) {
    if (now - blockedAt > BLOCK_DURATION_MS) {
      _blockedSessions.delete(sid);
      _statsCounters.blocksExpired++;
    }
  }
}

/**
 * Sticky session id derived from (key, current 10-minute window). This
 * means consecutive calls within the same window get the same session
 * (same IP), but a refresh happens organically every lifetime period.
 */
function buildStickySessionId(key, lifetimeMin) {
  const window = Math.floor(Date.now() / (lifetimeMin * 60 * 1000));
  return 's' + cheapHash(`${key}|${window}`);
}

function randomSessionId() {
  return 'r' + Math.random().toString(36).slice(2, 12) +
         Date.now().toString(36).slice(-4);
}

/**
 * Compact 32-bit-ish hash. Not cryptographically strong - just enough to
 * derive stable, short, base36-friendly session ids. Sticky session
 * collisions across users are harmless: same id means same exit IP, which
 * is the intent.
 */
function cheapHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Provider-specific username formatting. Each provider has its own way of
 * encoding session, country, and lifetime into the username string.
 * Adding a new provider = adding a case here.
 */
function buildUsername(provider, { username, sessionId, country, lifetimeMin }) {
  if (provider === 'iproyal') {
    return buildIpRoyalUsername({ username, sessionId, country, lifetimeMin });
  }
  if (provider === 'smartproxy') {
    return buildSmartproxyUsername({ username, sessionId, country });
  }
  if (provider === 'brightdata') {
    return buildBrightDataUsername({ username, sessionId, country });
  }
  return username;
}

/**
 * IPRoyal residential / ISP / datacenter username format:
 *   <user>[-country-<cc>]-session-<id>-lifetime-<n>m
 */
function buildIpRoyalUsername({ username, sessionId, country, lifetimeMin }) {
  const parts = [username];
  if (country) parts.push(`country-${country}`);
  parts.push(`session-${sessionId}`);
  parts.push(`lifetime-${lifetimeMin}m`);
  return parts.join('-');
}

/**
 * Smartproxy residential username format:
 *   user-session-<id>[-country-<cc>]
 * (Smartproxy uses an explicit lifetime via separate header, not username.)
 */
function buildSmartproxyUsername({ username, sessionId, country }) {
  const parts = [username, `session-${sessionId}`];
  if (country) parts.push(`country-${country}`);
  return parts.join('-');
}

/**
 * BrightData / Luminati format. Uses 'session' parameter encoded via
 * dashes inside the username. Country is a colon-prefixed param.
 */
function buildBrightDataUsername({ username, sessionId, country }) {
  const parts = [username, `session-${sessionId}`];
  if (country) parts.push(`country-${country}`);
  return parts.join('-');
}
