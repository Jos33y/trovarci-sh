// SOCKS5 proxy rotation for SMTP probes. PROXY_SESSION_LIFETIME_MIN=0 = bare username (trial plans).

const DEFAULT_HOST = 'geo.iproyal.com';
const DEFAULT_PORT = 32325;
const DEFAULT_LIFETIME_MIN = 10;
const BLOCK_DURATION_MS = 30 * 60 * 1000;
const KNOWN_PROVIDERS = new Set(['iproyal', 'smartproxy', 'brightdata']);

const _blockedSessions = new Map();
const _statsCounters = {
  proxiesIssued: 0,
  blocksRecorded: 0,
  blocksExpired: 0,
};

// Returns { ok:true, proxy } or { ok:false, code, error }.
// opts.stickyKey pins to same exit IP within lifetime window (ignored when bare mode active).
// opts.country forces exit country. opts.lifetimeMin overrides env.
export function getProxy(opts = {}) {
  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;
  if (!username || !password) {
    return { ok: false, code: 'PROXY_NO_CREDENTIALS', error: 'Proxy is not configured. Set PROXY_USERNAME and PROXY_PASSWORD.' };
  }

  const provider = (process.env.PROXY_PROVIDER || 'iproyal').toLowerCase();
  if (!KNOWN_PROVIDERS.has(provider)) {
    return { ok: false, code: 'PROXY_UNKNOWN_PROVIDER', error: `Unsupported PROXY_PROVIDER: ${provider}` };
  }

  const host = process.env.PROXY_HOST || DEFAULT_HOST;
  const portRaw = process.env.PROXY_PORT;
  const port = portRaw ? parseInt(portRaw, 10) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, code: 'PROXY_BAD_PORT', error: `PROXY_PORT must be a valid TCP port, got: ${portRaw}` };
  }

  // PROXY_SESSION_LIFETIME_MIN=0 -> bare-username mode (required for IPRoyal trial plans which reject modifiers).
  const lifetimeRaw = process.env.PROXY_SESSION_LIFETIME_MIN;
  const lifetimeFromEnv = lifetimeRaw === undefined || lifetimeRaw === '' ? null : parseInt(lifetimeRaw, 10);
  const bareMode = lifetimeFromEnv === 0;

  if (bareMode) {
    _statsCounters.proxiesIssued++;
    return {
      ok: true,
      proxy: { type: 'socks5', host, port, username, password, sessionId: null },
    };
  }

  const lifetimeMin = Number.isFinite(opts.lifetimeMin) && opts.lifetimeMin > 0
    ? Math.floor(opts.lifetimeMin)
    : (Number.isFinite(lifetimeFromEnv) && lifetimeFromEnv > 0 ? lifetimeFromEnv : DEFAULT_LIFETIME_MIN);

  cleanupExpiredBlocks();

  let sessionId;
  if (opts.stickyKey) {
    sessionId = buildStickySessionId(opts.stickyKey, lifetimeMin);
    // Blocked sticky id - fall back to random for this attempt; block expires naturally.
    if (_blockedSessions.has(sessionId)) sessionId = randomSessionId();
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
    proxy: { type: 'socks5', host, port, username: formattedUsername, password, sessionId },
  };
}

// Mark a session id as blocked. Subsequent same-stickyKey calls rotate to random within block window.
export function markBlocked(sessionId, _reason) {
  if (typeof sessionId !== 'string' || !sessionId) return;
  const wasNew = !_blockedSessions.has(sessionId);
  _blockedSessions.set(sessionId, Date.now());
  if (wasNew) _statsCounters.blocksRecorded++;
}

// outcome: 'ok' (no action) | 'block' (mark blocked) | 'error' (no action, worker may back off).
export function releaseProxy(sessionId, outcome) {
  if (outcome === 'block') markBlocked(sessionId, 'release-block');
}

export function getHealth() {
  cleanupExpiredBlocks();
  const lifetimeRaw = process.env.PROXY_SESSION_LIFETIME_MIN;
  const lifetimeParsed = lifetimeRaw === undefined || lifetimeRaw === '' ? null : parseInt(lifetimeRaw, 10);
  return {
    hasCredentials: !!(process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD),
    provider: (process.env.PROXY_PROVIDER || 'iproyal').toLowerCase(),
    host: process.env.PROXY_HOST || DEFAULT_HOST,
    port: parseInt(process.env.PROXY_PORT || String(DEFAULT_PORT), 10),
    bareMode: lifetimeParsed === 0,
    blockedSessions: _blockedSessions.size,
    counters: { ..._statsCounters },
  };
}

// Test-only. Clears in-process block map.
export function _resetForTests() {
  _blockedSessions.clear();
  _statsCounters.proxiesIssued = 0;
  _statsCounters.blocksRecorded = 0;
  _statsCounters.blocksExpired = 0;
}

// ─── Internals ───

function cleanupExpiredBlocks() {
  const now = Date.now();
  for (const [sid, blockedAt] of _blockedSessions) {
    if (now - blockedAt > BLOCK_DURATION_MS) {
      _blockedSessions.delete(sid);
      _statsCounters.blocksExpired++;
    }
  }
}

// Derives a stable session id per (key, time window). Same key within the same window = same exit IP.
function buildStickySessionId(key, lifetimeMin) {
  const window = Math.floor(Date.now() / (lifetimeMin * 60 * 1000));
  return 's' + cheapHash(`${key}|${window}`);
}

function randomSessionId() {
  return 'r' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}

// Compact base36 hash. Not cryptographic - just enough for stable short session ids.
function cheapHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function buildUsername(provider, opts) {
  if (provider === 'iproyal')    return buildIpRoyalUsername(opts);
  if (provider === 'smartproxy') return buildSmartproxyUsername(opts);
  if (provider === 'brightdata') return buildBrightDataUsername(opts);
  return opts.username;
}

// IPRoyal: USERNAME[-country-cc]-session-ID-lifetime-Nm
function buildIpRoyalUsername({ username, sessionId, country, lifetimeMin }) {
  const parts = [username];
  if (country) parts.push(`country-${country}`);
  parts.push(`session-${sessionId}`);
  parts.push(`lifetime-${lifetimeMin}m`);
  return parts.join('-');
}

// Smartproxy: user-session-ID[-country-cc] (lifetime via header, not username).
function buildSmartproxyUsername({ username, sessionId, country }) {
  const parts = [username, `session-${sessionId}`];
  if (country) parts.push(`country-${country}`);
  return parts.join('-');
}

// BrightData / Luminati: user-session-ID[-country-cc]
function buildBrightDataUsername({ username, sessionId, country }) {
  const parts = [username, `session-${sessionId}`];
  if (country) parts.push(`country-${country}`);
  return parts.join('-');
}
