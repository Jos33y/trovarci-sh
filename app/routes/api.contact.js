// POST /api/contact - persists a contact submission. Honeypot field 'website' marks bots as 'spam'.

import { getOptionalUser } from '~/utils/session.server';
import { sql } from '~/utils/db.server';

const ALLOWED_SUBJECTS = new Set(['general', 'payment', 'bug', 'feature', 'partnership', 'press']);
const ALLOWED_SOURCES  = new Set(['page', 'widget']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_MIN = 2;
const NAME_MAX = 100;
const MSG_MIN  = 10;
const MSG_MAX  = 5000;

function getIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  try {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 }); }

    const subject = typeof body?.subject === 'string' ? body.subject.trim()   : '';
    const name    = typeof body?.name    === 'string' ? body.name.trim()      : '';
    const email   = typeof body?.email   === 'string' ? body.email.trim()     : '';
    const message = typeof body?.message === 'string' ? body.message.trim()   : '';
    const source  = typeof body?.source  === 'string' ? body.source.trim()    : 'page';
    const honeypot = typeof body?.website === 'string' ? body.website.trim() : '';

    if (!ALLOWED_SUBJECTS.has(subject)) {
      return Response.json({ ok: false, code: 'BAD_SUBJECT', error: 'Pick a valid subject' }, { status: 400 });
    }
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return Response.json({ ok: false, code: 'BAD_NAME', error: 'Name is too short or too long' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > 320) {
      return Response.json({ ok: false, code: 'BAD_EMAIL', error: 'Email is not valid' }, { status: 400 });
    }
    if (message.length < MSG_MIN || message.length > MSG_MAX) {
      return Response.json({ ok: false, code: 'BAD_MESSAGE', error: `Message must be ${MSG_MIN}-${MSG_MAX} characters` }, { status: 400 });
    }
    const finalSource = ALLOWED_SOURCES.has(source) ? source : 'page';

    // Honeypot: bots fill 'website', humans never see it. Still return 200 so the bot does not learn.
    const status = honeypot.length > 0 ? 'spam' : 'new';

    const user = await getOptionalUser(request);
    const userId = user?.id || null;
    const ip = getIp(request);
    const ua = request.headers.get('user-agent') || null;

    await sql`
      INSERT INTO contact_messages
        (subject, name, email, message, user_id, source, ip_address, user_agent, status)
      VALUES
        (${subject}, ${name}, ${email}, ${message}, ${userId}, ${finalSource}, ${ip}, ${ua}, ${status})
    `;

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[contact] uncaught:', err?.message || err);
    return Response.json(
      { ok: false, code: 'INTERNAL', error: 'Could not send message. Try again.' },
      { status: 500 },
    );
  }
}
