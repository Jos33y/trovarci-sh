/* ═══════════════════════════════════════════════════════════════════════════
   ssrfGuard.server.js

   Prevents Server-Side Request Forgery by rejecting outbound connections to
   internal/reserved IP ranges. Any tool that accepts a user-supplied hostname
   and opens a socket MUST run the host through this guard first.

   What this stops:
     - 127.0.0.0/8       (loopback: 127.0.0.1, 127.0.0.2, ...)
     - 10.0.0.0/8        (RFC 1918 private)
     - 172.16.0.0/12     (RFC 1918 private)
     - 192.168.0.0/16    (RFC 1918 private)
     - 169.254.0.0/16    (link-local, includes AWS/GCP/Azure metadata at 169.254.169.254)
     - 0.0.0.0/8         (unspecified / "this network")
     - 100.64.0.0/10     (CGNAT)
     - 224.0.0.0/4       (multicast)
     - 240.0.0.0/4       (reserved)
     - ::1               (IPv6 loopback)
     - fc00::/7          (IPv6 unique local)
     - fe80::/10         (IPv6 link-local)

   What this does NOT stop (intentionally):
     - Public IPs that happen to host internal services (use firewall rules for that)
     - DNS rebinding at the socket layer (caller must use the resolved IP directly, not re-resolve)

   Usage pattern:
     const guard = await assertSafeHost(host);
     if (!guard.ok) return { error: guard.reason };
     // Connect to guard.ips[0] directly, not to host, to prevent DNS rebinding.
   ═══════════════════════════════════════════════════════════════════════════ */

import dns from 'node:dns/promises';
import net from 'node:net';

const DNS_TIMEOUT_MS = 5000;

/**
 * Returns { ok: true, ips: [...] } if the host resolves to only public IPs,
 * or { ok: false, reason, code } with a specific failure reason.
 */
export async function assertSafeHost(host) {
  if (typeof host !== 'string' || !host.trim()) {
    return { ok: false, reason: 'Host is required', code: 'INVALID_HOST' };
  }

  const trimmed = host.trim().toLowerCase();

  // Syntactic rejects that don't even need a DNS call.
  if (trimmed === 'localhost' || trimmed.endsWith('.localhost')) {
    return { ok: false, reason: 'Cannot connect to localhost', code: 'PRIVATE_ADDRESS' };
  }
  if (trimmed.length > 253) {
    return { ok: false, reason: 'Host name is too long', code: 'INVALID_HOST' };
  }

  // If the user supplied a raw IP, skip DNS and check directly.
  if (net.isIP(trimmed)) {
    if (isPrivateIp(trimmed)) {
      return { ok: false, reason: 'Cannot connect to private or reserved IP', code: 'PRIVATE_ADDRESS' };
    }
    return { ok: true, ips: [trimmed] };
  }

  // Resolve hostname. Respect a timeout to prevent DNS-stall-based DoS.
  let resolved;
  try {
    resolved = await Promise.race([
      resolveAll(trimmed),
      new Promise((_, rej) => setTimeout(() => rej(new Error('DNS timeout')), DNS_TIMEOUT_MS)),
    ]);
  } catch (err) {
    if (err.message === 'DNS timeout') {
      return { ok: false, reason: 'DNS resolution timed out', code: 'DNS_TIMEOUT' };
    }
    // ENOTFOUND, ENODATA etc.
    return { ok: false, reason: 'Could not resolve host', code: 'DNS_FAILURE' };
  }

  if (!resolved.length) {
    return { ok: false, reason: 'Could not resolve host', code: 'DNS_FAILURE' };
  }

  // Any private IP in the resolved set is a hard reject. Attackers can register
  // a domain that resolves to 127.0.0.1 or 169.254.169.254 specifically to
  // abuse our server.
  for (const ip of resolved) {
    if (isPrivateIp(ip)) {
      return {
        ok: false,
        reason: 'Host resolves to a private or reserved IP',
        code: 'PRIVATE_ADDRESS',
      };
    }
  }

  return { ok: true, ips: resolved };
}

/**
 * Check if a raw IP is in any private / reserved / link-local range.
 * IPv4 and IPv6 both handled.
 */
export function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // Not a valid IP at all - fail closed.
}

/* ─── IPv4 ─────────────────────────────────────────────────────────────── */

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // Malformed - fail closed.
  }
  const [a, b] = parts;

  // 0.0.0.0/8 - "this network"
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 - loopback
  if (a === 127) return true;
  // 169.254.0.0/16 - link-local (includes AWS/GCP/Azure metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 - CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 - multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 - reserved/broadcast
  if (a >= 240) return true;
  // 198.18.0.0/15 - benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;

  return false;
}

/* ─── IPv6 ─────────────────────────────────────────────────────────────── */

function isPrivateIpv6(ip) {
  // Normalize to lowercase expanded representation for prefix comparisons.
  const normalized = ip.toLowerCase();

  // ::1 - loopback
  if (normalized === '::1') return true;
  // ::  - unspecified
  if (normalized === '::') return true;
  // fc00::/7 - unique local (fc00:: through fdff::)
  if (/^f[cd]/.test(normalized)) return true;
  // fe80::/10 - link-local
  if (/^fe[89ab]/.test(normalized)) return true;
  // ::ffff:0:0/96 - IPv4-mapped IPv6; re-check the embedded v4 address
  const v4MappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch) return isPrivateIpv4(v4MappedMatch[1]);
  // 2001:db8::/32 - documentation
  if (normalized.startsWith('2001:db8')) return true;

  return false;
}

/* ─── DNS helpers ──────────────────────────────────────────────────────── */

async function resolveAll(host) {
  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(host).catch(() => []),
    dns.resolve6(host).catch(() => []),
  ]);
  const ips = [];
  if (v4.status === 'fulfilled') ips.push(...v4.value);
  if (v6.status === 'fulfilled') ips.push(...v6.value);
  return ips;
}
