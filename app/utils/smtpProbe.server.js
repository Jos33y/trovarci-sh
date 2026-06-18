/* ═══════════════════════════════════════════════════════════════════════════
   smtpProbe.server.js

   Performs an SMTP handshake against a mail exchanger. Verifies:
     1. TCP reachability on port 25
     2. Server issues a 220 greeting
     3. EHLO succeeds and the server advertises STARTTLS
     4. STARTTLS upgrade completes; we capture the TLS version

   Never throws. Failures return an ok:false result with a descriptive error.

   Why this matters for deliverability:
     - Many receiving servers refuse plaintext SMTP from sending servers
     - STARTTLS support signals that your mail server can negotiate TLS
     - TLS version matters: 1.0/1.1 are deprecated; 1.2 minimum, 1.3 ideal

   Caveats:
     - Port 25 is often blocked on consumer ISPs and some cloud vendors.
       If this module consistently times out in production, check egress
       rules on the hosting provider.
     - Some servers greylist unknown IPs. A single probe may fail even when
       the server is healthy for real SMTP clients.
   ═══════════════════════════════════════════════════════════════════════════ */

import net from 'node:net';
import tls from 'node:tls';

const CONNECT_TIMEOUT_MS = 5000;
const STEP_TIMEOUT_MS = 5000;
const TLS_TIMEOUT_MS = 5000;
const EHLO_HOSTNAME = 'trovarci.sh';

/**
 * Read lines from the socket until a final response line arrives.
 * SMTP uses "250-FOO" for continuation and "250 FOO" for the last line.
 * Returns the array of lines (without trailing CRLF).
 */
function readUntilFinal(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const lines = [];

    const timer = setTimeout(() => {
      cleanup();
      const err = new Error('SMTP response timed out');
      err.code = 'ETIMEOUT';
      reject(err);
    }, timeoutMs);

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        lines.push(line);
        // Final line has space after code: "250 foo". Continuation is "250-foo".
        if (/^\d{3} /.test(line)) {
          cleanup();
          resolve(lines);
          return;
        }
      }
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      if (lines.length > 0) resolve(lines);
      else reject(new Error('SMTP connection closed before response'));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

/**
 * Write a command to the socket with a trailing CRLF.
 */
function writeLine(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(line + '\r\n', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Probe a single mail exchanger.
 *
 * @param {string} host - MX hostname
 * @param {number} port - usually 25
 * @returns {Promise<object>} result shape documented below
 */
export async function probeSmtp(host, port = 25) {
  const start = Date.now();
  const result = {
    ok: false,
    host,
    port,
    connectTimeMs: null,
    greeting: null,
    supportsStarttls: false,
    tlsVersion: null,
    tlsCipher: null,
    error: null,
  };

  let socket;
  try {
    socket = await new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port, timeout: CONNECT_TIMEOUT_MS });
      const onConnect = () => {
        s.off('error', onError);
        s.off('timeout', onTimeout);
        resolve(s);
      };
      const onError = (err) => {
        s.destroy();
        reject(err);
      };
      const onTimeout = () => {
        s.destroy();
        const err = new Error(`TCP connect to ${host}:${port} timed out`);
        err.code = 'ETIMEOUT';
        reject(err);
      };
      s.once('connect', onConnect);
      s.once('error', onError);
      s.once('timeout', onTimeout);
    });
    result.connectTimeMs = Date.now() - start;
  } catch (err) {
    result.error = err.message || String(err);
    return result;
  }

  try {
    // Read the 220 greeting.
    const greetingLines = await readUntilFinal(socket, STEP_TIMEOUT_MS);
    const greeting = greetingLines.join(' ').trim();
    if (!/^220/.test(greeting)) {
      result.error = `Unexpected greeting: ${greeting.slice(0, 120)}`;
      socket.end();
      return result;
    }
    result.greeting = greeting.slice(0, 200);

    // Send EHLO and read the capability list.
    await writeLine(socket, `EHLO ${EHLO_HOSTNAME}`);
    const ehloLines = await readUntilFinal(socket, STEP_TIMEOUT_MS);
    const capabilities = ehloLines
      .filter((l) => /^250[- ]/.test(l))
      .map((l) => l.slice(4).toUpperCase().trim());
    result.supportsStarttls = capabilities.includes('STARTTLS');

    if (!result.supportsStarttls) {
      // Clean close; return without TLS fields populated.
      await writeLine(socket, 'QUIT').catch(() => {});
      socket.end();
      result.ok = true;
      return result;
    }

    // Initiate STARTTLS.
    await writeLine(socket, 'STARTTLS');
    const starttlsLines = await readUntilFinal(socket, STEP_TIMEOUT_MS);
    const starttlsReply = starttlsLines.join(' ');
    if (!/^220/.test(starttlsReply)) {
      result.error = `STARTTLS rejected: ${starttlsReply.slice(0, 120)}`;
      socket.end();
      return result;
    }

    // Upgrade to TLS.
    const tlsSocket = await new Promise((resolve, reject) => {
      const t = tls.connect({
        socket,
        servername: host,
        rejectUnauthorized: false,
        timeout: TLS_TIMEOUT_MS,
      });
      const onSecure = () => {
        t.off('error', onError);
        t.off('timeout', onTimeout);
        resolve(t);
      };
      const onError = (err) => {
        t.destroy();
        reject(err);
      };
      const onTimeout = () => {
        t.destroy();
        const err = new Error('TLS handshake timed out');
        err.code = 'ETIMEOUT';
        reject(err);
      };
      t.once('secureConnect', onSecure);
      t.once('error', onError);
      t.once('timeout', onTimeout);
    });

    result.tlsVersion = tlsSocket.getProtocol();
    const cipherInfo = tlsSocket.getCipher();
    result.tlsCipher = cipherInfo ? cipherInfo.name : null;
    result.ok = true;

    // Polite QUIT; ignore failures.
    await writeLine(tlsSocket, 'QUIT').catch(() => {});
    tlsSocket.end();
  } catch (err) {
    result.error = err.message || String(err);
    try { socket.destroy(); } catch {}
  }

  return result;
}
