/* ═══════════════════════════════════════════════════════════════════════════
   sslCheck.server.js

   Fetches and inspects a domain's SSL/TLS certificate by opening a TLS
   connection to port 443. Returns:
     - Issuer, subject, valid-from / valid-to
     - Days until expiry
     - Whether the cert actually covers the requested domain
     - Negotiated TLS protocol and cipher

   Design decisions:
     - rejectUnauthorized is false so we can still inspect certificates that
       have validation errors (expired, self-signed, wrong host). The
       validity determination is made server-side from the cert fields, not
       from Node's validation flag.
     - Subject Alternative Names are the authoritative source of domain
       coverage in modern certs; we check them first and fall back to CN
       only when altNames are empty.
   ═══════════════════════════════════════════════════════════════════════════ */

import tls from 'node:tls';

const CONNECT_TIMEOUT_MS = 6000;

/**
 * Flatten Node's certificate subject/issuer objects into a single-line string.
 * Node returns objects like { CN: 'example.com', O: 'Let\'s Encrypt' }.
 */
function flattenDn(dn) {
  if (!dn || typeof dn !== 'object') return '';
  return Object.entries(dn)
    .filter(([, v]) => typeof v === 'string' || Array.isArray(v))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(', ') : v}`)
    .join(', ');
}

/**
 * Test if a certificate's subject/SAN list matches the requested hostname.
 * Supports the single-wildcard form (*.example.com matches foo.example.com
 * but not foo.bar.example.com or example.com itself).
 */
function certCoversHostname(cert, hostname) {
  const host = hostname.toLowerCase();
  const names = [];
  // subjectaltname example: "DNS:example.com, DNS:*.example.com"
  if (typeof cert.subjectaltname === 'string') {
    for (const entry of cert.subjectaltname.split(',')) {
      const trimmed = entry.trim();
      if (trimmed.startsWith('DNS:')) names.push(trimmed.slice(4).toLowerCase());
    }
  }
  if (names.length === 0 && cert.subject?.CN) {
    names.push(cert.subject.CN.toLowerCase());
  }
  for (const name of names) {
    if (name === host) return true;
    if (name.startsWith('*.')) {
      const suffix = name.slice(1); // ".example.com"
      const hostParts = host.split('.');
      const hostSuffix = hostParts.slice(1).join('.');
      if (hostParts.length >= 2 && '.' + hostSuffix === suffix) return true;
    }
  }
  return false;
}

/**
 * Probe SSL on a hostname.
 *
 * @param {string} hostname
 * @returns {Promise<object>}
 */
export async function probeSsl(hostname) {
  const result = {
    ok: false,
    hostname,
    tlsVersion: null,
    cipher: null,
    cert: null,
    daysUntilExpiry: null,
    isExpired: false,
    matchesHostname: false,
    authorized: false,
    authorizationError: null,
    error: null,
  };

  try {
    const { cert, tlsVersion, cipher, authorized, authorizationError } =
      await new Promise((resolve, reject) => {
        const socket = tls.connect({
          host: hostname,
          port: 443,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: CONNECT_TIMEOUT_MS,
        });

        const cleanup = () => {
          socket.off('secureConnect', onSecure);
          socket.off('error', onError);
          socket.off('timeout', onTimeout);
        };

        const onSecure = () => {
          const peerCert = socket.getPeerCertificate(false);
          const version = socket.getProtocol();
          const cipherInfo = socket.getCipher();
          const authed = socket.authorized;
          const authErr = socket.authorizationError || null;
          cleanup();
          socket.end();
          resolve({
            cert: peerCert,
            tlsVersion: version,
            cipher: cipherInfo ? cipherInfo.name : null,
            authorized: authed,
            authorizationError: authErr ? String(authErr) : null,
          });
        };

        const onError = (err) => {
          cleanup();
          socket.destroy();
          reject(err);
        };

        const onTimeout = () => {
          cleanup();
          socket.destroy();
          const err = new Error('TLS handshake timed out');
          err.code = 'ETIMEOUT';
          reject(err);
        };

        socket.on('secureConnect', onSecure);
        socket.on('error', onError);
        socket.on('timeout', onTimeout);
      });

    result.tlsVersion = tlsVersion;
    result.cipher = cipher;
    result.authorized = authorized;
    result.authorizationError = authorizationError;

    if (!cert || Object.keys(cert).length === 0) {
      result.error = 'No certificate returned';
      return result;
    }

    const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
    const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
    const now = new Date();

    result.cert = {
      subject: flattenDn(cert.subject),
      subjectCn: cert.subject?.CN || null,
      issuer: flattenDn(cert.issuer),
      issuerCn: cert.issuer?.CN || cert.issuer?.O || null,
      validFrom: validFrom ? validFrom.toISOString() : null,
      validTo: validTo ? validTo.toISOString() : null,
      altNames:
        typeof cert.subjectaltname === 'string'
          ? cert.subjectaltname
              .split(',')
              .map((s) => s.trim().replace(/^DNS:/, ''))
              .filter(Boolean)
          : [],
    };

    if (validTo) {
      const diffMs = validTo.getTime() - now.getTime();
      result.daysUntilExpiry = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      result.isExpired = diffMs < 0;
    }

    result.matchesHostname = certCoversHostname(cert, hostname);
    result.ok = true;
  } catch (err) {
    result.error = err.message || String(err);
  }

  return result;
}
