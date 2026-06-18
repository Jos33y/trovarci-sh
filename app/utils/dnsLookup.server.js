/* ═══════════════════════════════════════════════════════════════════════════
   dnsLookup.server.js

   Thin wrapper around Node's dns/promises module. Every function:
     - resolves with a consistent { ok, value, error, code } shape
     - never throws; failures come back as { ok: false }
     - respects a configurable per-query timeout
     - normalises record values to simple strings or plain objects

   Why this module exists:
     - Domain Checker needs aggressive, parallel DNS resolution
     - DNS Generator v2 (scan existing records) needs the same primitives
     - SMTP Tester will need MX resolution before connect
     - Centralising the timeout, error-shape, and batching contract here keeps
       each caller's orchestration logic readable and non-trivial.

   Design notes:
     - Uses the system resolver (no custom nameservers by default). Callers
       that need specific nameservers can pass a resolver instance.
     - Timeouts fire via Promise.race against setTimeout. Node's dns module
       has its own internal timeout, but it is long and non-configurable
       without reaching into c-ares. This is the pragmatic ceiling.
     - All outputs are plain data suitable for JSON serialisation. No
       Date objects, no Buffers, no class instances.
   ═══════════════════════════════════════════════════════════════════════════ */

import dns from 'node:dns/promises';

const DEFAULT_TIMEOUT_MS = 7000;

/** DNS error codes that mean "no record" rather than "something broke". */
const NO_RECORD_CODES = new Set(['ENODATA', 'ENOTFOUND']);

/**
 * Wrap a promise in a timeout. Rejects with { code: 'ETIMEOUT' } when the
 * timeout fires before the inner promise settles.
 */
function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`DNS query exceeded ${timeoutMs}ms`);
      err.code = 'ETIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Normalise any DNS failure into the result shape { ok, value, error, code }.
 * Does not distinguish between "domain exists but no record of this type" and
 * "domain does not exist" beyond the returned code. Callers that need that
 * distinction should inspect result.code (ENODATA vs ENOTFOUND).
 */
function toError(err) {
  const code = err?.code || 'EUNKNOWN';
  return {
    ok: false,
    value: null,
    error: err?.message || String(err),
    code,
    isNoRecord: NO_RECORD_CODES.has(code),
  };
}

function toOk(value) {
  return { ok: true, value, error: null, code: null, isNoRecord: false };
}

/* ─── Individual record-type lookups ─────────────────────────────────────── */

/**
 * Resolve TXT records. Node returns string[][] where each inner array is the
 * concatenation fragments of a single TXT record. We join and return string[].
 */
export async function resolveTxt(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolveTxt(name), timeoutMs);
    const joined = raw.map((parts) => parts.join(''));
    return toOk(joined);
  } catch (err) {
    return toError(err);
  }
}

/**
 * Resolve MX records. Returns [{ priority, exchange }] sorted by priority asc.
 */
export async function resolveMx(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolveMx(name), timeoutMs);
    const sorted = [...raw].sort((a, b) => a.priority - b.priority);
    return toOk(sorted);
  } catch (err) {
    return toError(err);
  }
}

/** Resolve NS records. Returns string[] of nameserver hostnames. */
export async function resolveNs(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolveNs(name), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/**
 * Resolve SOA record. Returns { nsname, hostmaster, serial, refresh, retry,
 * expire, minttl }.
 */
export async function resolveSoa(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolveSoa(name), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/** Resolve CNAME records. Returns string[]. */
export async function resolveCname(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolveCname(name), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/**
 * Resolve CAA records. Returns [{ critical, issue?, issuewild?, iodef? }].
 * Node returns heterogeneous shapes per record so we pass them through.
 */
export async function resolveCaa(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolveCaa(name), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/** Resolve A records (IPv4). Returns string[] of IPs. */
export async function resolve4(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolve4(name), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/** Resolve AAAA records (IPv6). Returns string[] of IPs. */
export async function resolve6(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolve6(name), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/**
 * Reverse-resolve an IP to its PTR hostnames. Node's dns.reverse accepts
 * either IPv4 or IPv6. Returns string[].
 */
export async function reverse(ip, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.reverse(ip), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/**
 * Attempt to resolve a generic record type. Node's dns module accepts a
 * second arg to dns.resolve(name, rrtype). Useful for record types not
 * covered by a dedicated method (e.g. DS, DNSKEY, TLSA).
 *
 * NOTE: support depends on the underlying c-ares build. Unsupported types
 * come back as an error with code EBADRESP or similar.
 */
export async function resolveGeneric(name, rrtype, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const raw = await withTimeout(dns.resolve(name, rrtype), timeoutMs);
    return toOk(raw);
  } catch (err) {
    return toError(err);
  }
}

/* ─── Batched helpers ───────────────────────────────────────────────────── */

/**
 * Run multiple TXT lookups in parallel. Useful for DKIM selector scanning
 * where we try many selectors at once.
 *
 * @param {string[]} names - fully-qualified names to resolve
 * @returns {Promise<Record<string, ReturnType<typeof resolveTxt>>>}
 *   keyed by input name, value is the standard result shape
 */
export async function batchResolveTxt(names, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const entries = await Promise.all(
    names.map(async (name) => [name, await resolveTxt(name, timeoutMs)])
  );
  return Object.fromEntries(entries);
}

/**
 * Resolve A records for a batch of hostnames in parallel. Used to diversity-
 * check nameservers and MX hosts by their IP network prefixes.
 */
export async function batchResolve4(names, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const entries = await Promise.all(
    names.map(async (name) => [name, await resolve4(name, timeoutMs)])
  );
  return Object.fromEntries(entries);
}

/* ─── Utilities ─────────────────────────────────────────────────────────── */

/**
 * Extract the first TXT record that matches a prefix (e.g. "v=spf1", "v=DMARC1").
 * TXT lookups often return multiple records; this picks the semantically
 * relevant one. Returns null if no matching record.
 */
export function findRecordStartingWith(txtValues, prefix) {
  if (!Array.isArray(txtValues)) return null;
  const match = txtValues.find((v) => typeof v === 'string' && v.startsWith(prefix));
  return match || null;
}

/**
 * Reverse an IPv4 address for DNSBL-style queries.
 * 192.0.2.1 -> "1.2.0.192"
 */
export function reverseIpv4(ip) {
  if (typeof ip !== 'string') return null;
  const octets = ip.split('.');
  if (octets.length !== 4) return null;
  return octets.reverse().join('.');
}

/**
 * Return the /16 network portion of an IPv4 address. Used to compare
 * nameservers or MX hosts for network diversity.
 * 192.0.2.1 -> "192.0"
 */
export function network16(ip) {
  if (typeof ip !== 'string') return null;
  const octets = ip.split('.');
  if (octets.length !== 4) return null;
  return `${octets[0]}.${octets[1]}`;
}

/**
 * Basic domain-name sanity check. Full validation lives in the public-facing
 * dnsRecords.js (browser bundle); this is the server's belt-and-braces check.
 */
export function isLikelyDomain(input) {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253) return false;
  if (!trimmed.includes('.')) return false;
  const pattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
  return pattern.test(trimmed);
}
