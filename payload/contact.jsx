// /contact - full-page contact form. Posts to /api/contact. Submissions land in contact_messages table.

import { useEffect, useState } from 'react';
import { useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getOptionalUser } from '~/utils/session.server';
import styles from '~/styles/modules/routes/contact.module.css';

export const meta = () => [
  { title: 'Contact | Trovarcis Reach' },
  { name: 'description', content: 'Get in touch with the Trovarcis team. Questions, feedback, partnerships, press.' },
];

const SUBJECTS = [
  { value: 'general',     label: 'General question' },
  { value: 'payment',     label: 'Payment or billing' },
  { value: 'bug',         label: 'Bug report' },
  { value: 'feature',     label: 'Feature request' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'press',       label: 'Press / Media' },
];

export async function loader({ request }) {
  const user = await getOptionalUser(request);
  return {
    prefill: user ? { name: user.name || '', email: user.email || '' } : { name: '', email: '' },
  };
}

export default function ContactPage() {
  const { prefill } = useLoaderData();

  const [subject, setSubject] = useState('general');
  const [name,    setName]    = useState(prefill.name);
  const [email,   setEmail]   = useState(prefill.email);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (prefill.name)  setName(prefill.name);
    if (prefill.email) setEmail(prefill.email);
  }, [prefill.name, prefill.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, name, email, message, website, source: 'page' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || `Could not send message (${res.status})`);
        setSending(false);
        return;
      }
      setSent(true);
      setSending(false);
    } catch (err) {
      setError(err?.message || 'Could not send message');
      setSending(false);
    }
  };

  const resetForm = () => {
    setSubject('general');
    setMessage('');
    setWebsite('');
    setSent(false);
    setError('');
  };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container">

          <header className={styles.hero}>
            <p className={styles.eyebrow}>Contact</p>
            <h1 className={styles.title}>Get in touch</h1>
            <p className={styles.subtitle}>
              Questions, feedback, or a partnership idea? Send a message and we'll get back to you within one business day.
            </p>
          </header>

          <div className={styles.grid}>

            <aside className={styles.info}>
              <h2 className={styles.infoTitle}>Other ways to reach us</h2>
              <dl className={styles.infoList}>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>Email</dt>
                  <dd className={styles.infoValue}>
                    <a href="mailto:hello@trovarcis.com" className={styles.infoLink}>hello@trovarcis.com</a>
                  </dd>
                </div>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>Support</dt>
                  <dd className={styles.infoValue}>
                    <a href="mailto:support@trovarcis.com" className={styles.infoLink}>support@trovarcis.com</a>
                  </dd>
                </div>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>Response time</dt>
                  <dd className={styles.infoValue}>Within 24 hours</dd>
                </div>
                <div className={styles.infoItem}>
                  <dt className={styles.infoLabel}>Office</dt>
                  <dd className={styles.infoValue}>Wyoming, USA</dd>
                </div>
              </dl>
            </aside>

            <section className={styles.formCard}>
              {sent ? (
                <div className={styles.success} role="status">
                  <div className={styles.successIcon} aria-hidden="true">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className={styles.successTitle}>Message sent</h2>
                  <p className={styles.successSub}>
                    Thanks for reaching out. We'll get back to you at <strong>{email}</strong> within one business day.
                  </p>
                  <button type="button" onClick={resetForm} className={styles.secondaryBtn}>
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className={styles.form} noValidate>
                  <h2 className={styles.formTitle}>Send a message</h2>

                  <div className={styles.field}>
                    <label htmlFor="contact-subject" className={styles.label}>Subject</label>
                    <select
                      id="contact-subject"
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

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="contact-name" className={styles.label}>Name</label>
                      <input
                        id="contact-name"
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
                      <label htmlFor="contact-email" className={styles.label}>Email</label>
                      <input
                        id="contact-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="contact-message" className={styles.label}>Message</label>
                    <textarea
                      id="contact-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className={styles.textarea}
                      rows={6}
                      required
                      minLength={10}
                      maxLength={5000}
                      placeholder="What can we help you with?"
                    />
                    <p className={styles.charCount}>{message.length} / 5000</p>
                  </div>

                  {/* Honeypot - hidden from humans, filled by bots */}
                  <div className={styles.honeypot} aria-hidden="true">
                    <label htmlFor="contact-website">Website</label>
                    <input
                      id="contact-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>

                  {error && (
                    <div className={styles.error} role="alert">{error}</div>
                  )}

                  <button type="submit" disabled={sending} className={styles.submitBtn}>
                    {sending ? 'Sending...' : 'Send message'}
                  </button>
                </form>
              )}
            </section>

          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
