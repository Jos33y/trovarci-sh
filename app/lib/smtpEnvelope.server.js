/* Sender and recipient check for the SMTP Tester, without sending a message.

   Opens its own connection, logs in, then asks the server whether it would accept
   MAIL FROM and RCPT TO. As soon as it has the answer it cancels with RSET and leaves
   with QUIT. DATA is never sent, so nothing can be delivered.

   Used after nodemailer's verify() has already proven the connection and login, so
   failures here are about the sender or recipient, not the settings. */

import net from 'node:net';
import tls from 'node:tls';

const UNSAFE = /[\r\n<>]/;

function connectSocket({ address, host, port, secure, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    const socket = secure
      ? tls.connect({ host: address, port, servername: host, rejectUnauthorized: true }, () => resolve(socket))
      : net.connect({ host: address, port }, () => resolve(socket));
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('Timed out waiting for the server')));
    socket.once('error', onError);
  });
}

function upgradeSocket(socket, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({ socket, servername: host, rejectUnauthorized: true }, () => resolve(secured));
    secured.setTimeout(timeoutMs, () => secured.destroy(new Error('Timed out during encryption')));
    secured.once('error', reject);
  });
}

// Reads complete SMTP replies (one or more lines, the last one "NNN text").
function makeReader(socket) {
  let buffer = '';
  let lines = [];
  let waiting = null;

  const flush = () => {
    if (!waiting) return;
    const end = lines.findIndex((l) => /^\d{3}(?: |$)/.test(l));
    if (end === -1) return;
    const reply = lines.slice(0, end + 1);
    lines = lines.slice(end + 1);
    const { resolve } = waiting;
    waiting = null;
    resolve({ code: Number(reply[reply.length - 1].slice(0, 3)), lines: reply, text: reply.join('\n') });
  };

  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop();
    lines.push(...parts);
    flush();
  };
  const onFail = (err) => {
    if (!waiting) return;
    const { reject } = waiting;
    waiting = null;
    reject(err || new Error('Connection closed by the server'));
  };

  socket.on('data', onData);
  socket.on('error', onFail);
  socket.on('close', () => onFail());

  return {
    next() {
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
        flush();
      });
    },
    detach() {
      socket.removeListener('data', onData);
    },
  };
}

/**
 * @returns {Promise<{ mailFrom: {ok, error}, rcptTo: {ok, error}, transcript: Array<{step, type, text}> }>}
 */
export async function checkEnvelope({ address, host, port, secure, requireTLS, ignoreTLS, username, password, from, to, ehloName, timeoutMs }) {
  const result = { mailFrom: { ok: false, error: null }, rcptTo: { ok: false, error: null }, transcript: [] };
  if (UNSAFE.test(from)) { result.mailFrom.error = 'Sender address is not valid'; return result; }
  if (UNSAFE.test(to)) { result.mailFrom.ok = true; result.rcptTo.error = 'Recipient address is not valid'; return result; }

  let socket;
  try {
    socket = await connectSocket({ address, host, port, secure, timeoutMs });
    let reader = makeReader(socket);
    const send = (line) => new Promise((resolve, reject) => socket.write(`${line}\r\n`, (err) => (err ? reject(err) : resolve())));
    const ask = async (line) => { await send(line); return reader.next(); };

    let reply = await reader.next();
    if (reply.code !== 220) throw new Error(reply.text);

    reply = await ask(`EHLO ${ehloName}`);
    if (reply.code !== 250) throw new Error(reply.text);
    let caps = reply.lines.map((l) => l.slice(4).toUpperCase());

    if (!secure && !ignoreTLS && (requireTLS || caps.some((c) => c.startsWith('STARTTLS')))) {
      reply = await ask('STARTTLS');
      if (reply.code !== 220) throw new Error(reply.text);
      reader.detach();
      socket = await upgradeSocket(socket, host, timeoutMs);
      reader = makeReader(socket);
      reply = await ask(`EHLO ${ehloName}`);
      if (reply.code !== 250) throw new Error(reply.text);
      caps = reply.lines.map((l) => l.slice(4).toUpperCase());
    }

    const authLine = caps.find((c) => c.startsWith('AUTH'));
    if (authLine && username) {
      const methods = authLine.split(/[\s=]+/).slice(1);
      if (methods.includes('PLAIN')) {
        reply = await ask(`AUTH PLAIN ${Buffer.from(`\u0000${username}\u0000${password}`).toString('base64')}`);
      } else {
        reply = await ask('AUTH LOGIN');
        if (reply.code === 334) reply = await ask(Buffer.from(username).toString('base64'));
        if (reply.code === 334) reply = await ask(Buffer.from(password).toString('base64'));
      }
      if (reply.code !== 235) throw new Error(reply.text);
    }

    reply = await ask(`MAIL FROM:<${from}>`);
    result.transcript.push({ step: 'mail_from', type: 'sent', text: `MAIL FROM:<${from}>` });
    result.transcript.push({ step: 'mail_from', type: 'recv', text: reply.text });
    if (reply.code !== 250) {
      result.mailFrom.error = reply.text;
    } else {
      result.mailFrom.ok = true;
      reply = await ask(`RCPT TO:<${to}>`);
      result.transcript.push({ step: 'rcpt_to', type: 'sent', text: `RCPT TO:<${to}>` });
      result.transcript.push({ step: 'rcpt_to', type: 'recv', text: reply.text });
      if (reply.code === 250 || reply.code === 251) result.rcptTo.ok = true;
      else result.rcptTo.error = reply.text;
    }

    // Cancel the message before it exists, then leave.
    await ask('RSET').catch(() => {});
    result.transcript.push({ step: 'quit', type: 'sent', text: 'RSET' });
    await send('QUIT').catch(() => {});
    result.transcript.push({ step: 'quit', type: 'sent', text: 'QUIT' });
  } catch (err) {
    if (!result.mailFrom.ok && !result.mailFrom.error) result.mailFrom.error = err?.message || 'Could not check the sender';
    else if (result.mailFrom.ok && !result.rcptTo.ok && !result.rcptTo.error) result.rcptTo.error = err?.message || 'Could not check the recipient';
  } finally {
    if (socket) socket.end();
  }
  return result;
}
