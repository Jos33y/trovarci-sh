// Floating chat-bubble contact widget. Mounted sitewide in root.jsx. Hides on /contact.

import { useEffect, useRef, useState } from 'react';
import { useLocation, useRouteLoaderData } from 'react-router';
import ChatBubbleIcon from '~/components/icons/ChatBubbleIcon';
import CloseIcon from '~/components/icons/CloseIcon';
import styles from '~/styles/modules/shared/ContactWidget.module.css';

const SUBJECTS = [
  { value: 'general',     label: 'General question' },
  { value: 'payment',     label: 'Payment or billing' },
  { value: 'bug',         label: 'Bug report' },
  { value: 'feature',     label: 'Feature request' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'press',       label: 'Press / Media' },
];

// Routes that should never show the widget (avoid double surface on the contact page, hide on admin).
const HIDDEN_PATHS = new Set(['/contact']);

function shouldHide(pathname) {
  if (HIDDEN_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/admin')) return true;
  return false;
}

export default function ContactWidget() {
  const location = useLocation();
  const rootData = useRouteLoaderData('root');
  const prefill = rootData?.user
    ? { name: rootData.user.name || '', email: rootData.user.email || '' }
    : { name: '', email: '' };

  const [open,    setOpen]    = useState(false);
  const [subject, setSubject] = useState('general');
  const [name,    setName]    = useState(prefill.name);
  const [email,   setEmail]   = useState(prefill.email);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const messageRef = useRef(null);

  // Sync prefill if user logs in mid-session.
  useEffect(() => {
    if (prefill.name)  setName((n) => n || prefill.name);
    if (prefill.email) setEmail((e) => e || prefill.email);
  }, [prefill.name, prefill.email]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus the message field on open for fast typing.
  useEffect(() => {
    if (open && !sent && messageRef.current) {
      const t = setTimeout(() => messageRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, sent]);

  if (shouldHide(location.pathname)) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, name, email, message, website, source: 'widget' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Could not send (${res.status})`);
        setSending(false);
        return;
      }
      setSent(true);
      setSending(false);
    } catch (err) {
      setError(err?.message || 'Could not send');
      setSending(false);
    }
  };

  const reset = () => {
    setSubject('general');
    setMessage('');
    setWebsite('');
    setSent(false);
    setError('');
  };

  const handleClose = () => {
    setOpen(false);
    // Reset success state on next open so a fresh form greets them.
    if (sent) setTimeout(reset, 250);
  };

  return (
    <>
      {/* Bubble trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${styles.bubble} ${open ? styles.bubbleHidden : ''}`}
        aria-label="Open contact form"
      >
        <ChatBubbleIcon size={22} />
      </button>

      {/* Panel */}
      <div className={`${styles.panel} ${open ? styles.panelOpen : ''}`} role="dialog" aria-label="Contact us" aria-hidden={!open}>
        <header className={styles.panelHead}>
          <div>
            <div className={styles.panelTitle}>Contact us</div>
            <div className={styles.panelSub}>We reply within a business day</div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={styles.closeBtn}
            aria-label="Close contact form"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className={styles.panelBody}>
          {sent ? (
            <div className={styles.success} role="status">
              <div className={styles.successIcon} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.successTitle}>Message sent</div>
              <p className={styles.successSub}>
                We'll reply to <strong>{email}</strong> within a business day.
              </p>
              <button type="button" onClick={reset} className={styles.linkBtn}>
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="cw-subject" className={styles.label}>Subject</label>
                <select
                  id="cw-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={styles.select}
                  required
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="cw-name" className={styles.label}>Name</label>
                <input
                  id="cw-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={styles.input}
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="cw-email" className={styles.label}>Email</label>
                <input
                  id="cw-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  autoComplete="email"
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="cw-message" className={styles.label}>Message</label>
                <textarea
                  id="cw-message"
                  ref={messageRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={styles.textarea}
                  rows={4}
                  required
                  minLength={10}
                  maxLength={5000}
                  placeholder="What can we help with?"
                />
              </div>

              {/* Honeypot */}
              <div className={styles.honeypot} aria-hidden="true">
                <label htmlFor="cw-website">Website</label>
                <input
                  id="cw-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button type="submit" disabled={sending} className={styles.submitBtn}>
                {sending ? 'Sending...' : 'Send'}
              </button>

              <p className={styles.foot}>
                Or email <a href="mailto:hello@trovarcis.com" className={styles.footLink}>hello@trovarcis.com</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
