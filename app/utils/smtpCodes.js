// Plain-words decoder for mail server replies and bounce messages. Shared by the help desk
// (paste an error, get the meaning) and the SMTP error codes guide.
//
// Sources: RFC 5321 (reply codes), RFC 3463 and RFC 4954 / 7372 (enhanced status codes),
// and the providers' own pages for the provider-specific lines.

// Whole replies we recognise by a word in them, checked first.
const KNOWN = [
  {
    test: /blocked using|spamhaus|spamcop|barracuda|blacklist|blocklist|\bRBL\b/i,
    title: 'Your server or domain is on a blocklist',
    means: 'The receiving server checked a blocklist, found you on it, and refused the email.',
    todo: 'Find which list with the Domain Checker, fix the cause, then ask that list for removal.',
    guide: '/guides/remove-from-blocklist',
  },
  {
    test: /SmtpClientAuthentication is disabled|5\.7\.139(?![\s\S]*credentials were incorrect)/i,
    title: 'Microsoft 365 has SMTP sign-in turned off',
    means: 'The password may be fine. Microsoft 365 has SMTP sign-in switched off, for this mailbox, the whole organisation, or by its security defaults.',
    todo: 'Whoever manages the Microsoft 365 account turns SMTP sign-in back on: for one mailbox under Manage email apps, or for everyone in the Exchange admin center.',
    guide: '/guides/microsoft-365-smtp-auth',
  },
  {
    test: /Daily user sending (quota|limit) exceeded|5\.4\.5/i,
    title: 'Gmail daily sending limit reached',
    means: 'This Gmail or Google Workspace account has sent as much as it may today.',
    todo: 'Stop sending from it. Sending usually comes back within 1 to 24 hours.',
    guide: '/guides/daily-sending-limit-exceeded',
  },
  {
    test: /Throttling failure: Daily message quota exceeded/i,
    title: 'Amazon SES daily quota reached',
    means: 'The SES account has sent its 24-hour quota.',
    todo: 'Wait for the quota to reset, or ask AWS for a higher sending quota.',
    guide: '/guides/daily-sending-limit-exceeded',
  },
  {
    test: /Throttling failure: Maximum sending rate exceeded/i,
    title: 'Amazon SES: sending too fast',
    means: 'You sent more emails per second than the SES account allows. Nothing is wrong with the email.',
    todo: 'Slow down and send again in a moment.',
    guide: '/guides/daily-sending-limit-exceeded',
  },
  {
    test: /TSS04/i,
    title: 'Yahoo is holding your email back for now',
    means: 'Yahoo is deferring mail from you, usually because of how people reacted to earlier emails or a sudden jump in volume.',
    todo: 'Most sending software retries by itself. Send less at once, and check your list and spam complaints.',
    guide: '/guides/find-why-emails-go-to-spam',
  },
  {
    test: /Username and Password not accepted|5\.7\.8/i,
    title: 'Wrong username or password',
    means: 'The server refused the login. On Gmail and Microsoft accounts this usually means the normal password was used instead of an app password.',
    todo: 'Use an app password, and your full email address as the username.',
    guide: '/guides/gmail-app-password',
  },
];

// Enhanced status codes: the middle and last number. The first number (2, 4 or 5) says
// whether it worked, failed for now or failed for good.
const DETAIL = {
  '1.1': ['The address doesn’t exist', 'Remove it from your list.', '/guides/email-bounce-meaning'],
  '1.2': ['The domain in the address doesn’t exist or can’t receive email', 'Check the spelling of the domain, or remove the address.', '/guides/email-bounce-meaning'],
  '1.3': ['The address is written wrong', 'Fix the typo, or remove it.', '/guides/verify-email-list-before-sending'],
  '1.6': ['The mailbox has moved, with no forwarding', 'Remove it, or ask the person for their new address.', '/guides/email-bounce-meaning'],
  '1.7': ['Your sender address is written wrong', 'Check the From address in your settings.', null],
  '1.8': ['Your sender domain is wrong or can’t receive replies', 'Check the domain in your From address has working DNS.', '/guides/find-why-emails-go-to-spam'],
  '2.1': ['The mailbox is disabled', 'Remove the address.', '/guides/email-bounce-meaning'],
  '2.2': ['The mailbox is full', 'Try again later. Remove it if it keeps happening.', '/guides/email-bounce-meaning'],
  '2.3': ['The email is too big for that mailbox', 'Make the email or its attachments smaller.', null],
  '3.4': ['The email is too big for that server', 'Make the email or its attachments smaller.', null],
  '4.1': ['The receiving server didn’t answer', 'Usually temporary. Your software should retry.', null],
  '4.4': ['The email couldn’t be routed to the recipient’s server', 'Check the domain is spelled right. Try again later.', null],
  '4.7': ['The email kept failing until it expired', 'The receiving server was unreachable for too long. Check the address.', null],
  '5.3': ['Too many recipients in one email', 'Send to fewer people per email.', null],
  '7.0': ['Refused by the server’s security rules', 'Often a login or encryption requirement. Check your settings.', '/guides/gmail-smtp-settings'],
  '7.1': ['Refused by the server’s rules', 'Your domain, your server or the email itself was refused. Check your domain and blocklists.', '/guides/find-why-emails-go-to-spam'],
  '7.20': ['No valid email signature (DKIM)', 'Set up DKIM for your domain.', '/guides/google-workspace-spf-dkim-dmarc'],
  '7.23': ['Your server isn’t allowed by your SPF record', 'Add the service you send through to your SPF record.', '/guides/add-dmarc-record'],
  '7.25': ['Your sending server has no name (reverse DNS)', 'Ask your email host to set reverse DNS for the server.', '/guides/find-why-emails-go-to-spam'],
  '7.26': ['Your email failed the checks that prove it’s from you', 'Set up SPF, DKIM and DMARC so they pass and match your From domain.', '/guides/google-workspace-spf-dkim-dmarc'],
  '7.9': ['The login method is too weak for the server', 'Switch on encryption (port 587 with STARTTLS, or 465).', '/guides/gmail-smtp-settings'],
  '7.11': ['The server needs an encrypted connection', 'Use port 587 with STARTTLS, or 465 with SSL.', '/guides/gmail-smtp-settings'],
};

// Basic three-digit replies, used when there is no enhanced code.
const BASIC = {
  421: ['The server is busy or closing the connection', 'Temporary. Wait and try again; send more slowly.'],
  450: ['The mailbox isn’t available right now', 'Temporary. Your software should retry.'],
  451: ['The server had a problem on its side', 'Temporary. Try again later.'],
  452: ['The server is short of space, or you sent to too many at once', 'Temporary. Send to fewer recipients per email, then retry.'],
  454: ['Temporary refusal, often encryption or sending too fast', 'Wait and try again; slow down.'],
  500: ['The server didn’t understand a command', 'Usually a problem in the sending software. Try another port.'],
  530: ['The server wants you to log in first', 'Add your username and password, with encryption on.'],
  534: ['The login method is too weak', 'Switch on encryption, or use an app password.'],
  535: ['Wrong username or password', 'On Gmail and Microsoft accounts, use an app password.'],
  550: ['Refused for good: no such mailbox, or blocked', 'Read the rest of the message: the address may not exist, or your email was refused.'],
  551: ['That address isn’t on this server', 'Check the address.'],
  552: ['Too big, or the mailbox is full', 'Make the email smaller, or try again later.'],
  553: ['The address isn’t allowed', 'Check the address, including your own From address.'],
  554: ['The server refused the email', 'Read the rest of the message for the reason: often a blocklist or content filter.'],
};

const KIND = {
  2: { word: 'Worked', tone: 'pass' },
  4: { word: 'Failed for now', tone: 'warn', note: 'A temporary failure. Your software should retry; nothing to remove.' },
  5: { word: 'Failed for good', tone: 'fail', note: 'A permanent failure. Sending the same email again will fail the same way.' },
};

// A bare three-digit number only counts as a reply code when it reads like one: alone, or
// followed by the server's capitalised text or by "mean", "error", "code" or "bounce".
// "550 Mailbox unavailable" and "what does 550 mean" count; "send 500 emails a day" does not.
const BASIC_CODE = /(?:^|[\s:(]|(?:[Ee]rror|[Cc]ode|SMTP|smtp|[Rr]eply)\s+)([245]\d{2})(?:[\s-]+(?=[A-Z#<\[]|[245]\.\d|(?:mean|means|error|code|bounce|reply)\b)|$)/;
const ENHANCED_CODE = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/;
const PHRASES = /TSS04|SmtpClientAuthentication|Throttling failure|Username and Password not accepted|blocked using/i;

function basicCode(s) {
  if (/^[245]\d{2}$/.test(s)) return s;
  const m = s.match(BASIC_CODE);
  if (!m) return null;
  // A code at the very end only counts after a word like "error" or "code".
  const atEnd = m.index + m[0].length === s.length && !/[\s-]$/.test(m[0]);
  if (atEnd && !/(?:error|code|smtp|reply)\s+[245]\d{2}$/i.test(s)) return null;
  return m[1];
}

export function looksLikeError(text) {
  const s = String(text || '').trim();
  if (basicCode(s)) return true;
  return ENHANCED_CODE.test(s) || PHRASES.test(s);
}

/** Returns { code, kind, title, means, todo, guide } or null. */
export function decode(text) {
  const s = String(text || '');
  if (!looksLikeError(s)) return null;
  const basic = basicCode(s.trim());
  const enhanced = s.match(ENHANCED_CODE);
  const first = Number(enhanced ? enhanced[1] : basic ? basic[0] : 0);
  const kind = KIND[first] || null;
  const code = [basic, enhanced && enhanced[0]].filter(Boolean).join(' ');

  const known = KNOWN.find((k) => k.test.test(s));
  if (known) return { code, kind, ...known };

  if (enhanced) {
    const d = DETAIL[`${enhanced[2]}.${enhanced[3]}`];
    if (d) return { code, kind, title: d[0], means: kind?.note || '', todo: d[1], guide: d[2] };
  }
  if (basic && BASIC[basic]) {
    const b = BASIC[basic];
    return { code, kind, title: b[0], means: kind?.note || '', todo: b[1], guide: first === 5 ? '/guides/email-bounce-meaning' : null };
  }
  if (kind) return { code, kind, title: kind.word, means: kind.note || '', todo: 'Read the rest of the message for the reason.', guide: '/guides/smtp-error-codes' };
  return null;
}
