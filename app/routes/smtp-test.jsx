import { useState } from 'react';
import SmtpTester from '~/components/tools/SmtpTester';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/smtp-test.module.css';
import { Link } from 'react-router';

export function meta() {
  return [
    { title: 'Free SMTP Connection Tester | Test SMTP Server Online | Trovarcis Reach' },
    { name: 'description', content: 'Test your SMTP connection in 8 steps. See the full protocol handshake, TLS status, and authentication result with plain-language explanations. Free, no account needed.' },
    { name: 'keywords', content: 'test SMTP connection, SMTP tester, SMTP not working, check SMTP server, test SMTP credentials, SMTP port 587 test' },
    { property: 'og:title', content: 'Free SMTP Connection Tester | Trovarcis Reach' },
    { property: 'og:description', content: 'Test your SMTP connection step by step. See exactly where it succeeds or fails.' },
    { property: 'og:url', content: 'https://trovarci.sh/smtp-test' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Free SMTP Connection Tester | Trovarcis Reach' },
    { name: 'twitter:description', content: 'Test your SMTP connection step by step. See exactly where it succeeds or fails.' },
  ];
}

function SchemaMarkup() {
  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'SMTP Connection Tester',
    url: 'https://trovarci.sh/smtp-test',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: 'Test your SMTP connection in 8 steps with full protocol output and plain-language explanations.',
  };
  const faqItems = FAQ_DATA.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  }));
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
}

function PlugIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v6M8 2v6M16 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="8" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 14v4M9 22h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="15" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11l8-8M16 3l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="14" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="6.5" r="1" fill="currentColor" />
      <circle cx="7" cy="17.5" r="1" fill="currentColor" />
    </svg>
  );
}

const EXPLAINER_CARDS = [
  { icon: PlugIcon, label: 'Step 1-2', title: 'TCP + Banner', desc: 'Connects to the server and waits for the 220 greeting. If this fails, the server is unreachable or the port is blocked.' },
  { icon: ServerIcon, label: 'Step 3', title: 'EHLO Handshake', desc: 'Identifies our client to the server and discovers its capabilities: max message size, supported extensions, and TLS availability.' },
  { icon: LockIcon, label: 'Step 4', title: 'STARTTLS / TLS', desc: 'Upgrades the connection to encrypted TLS. Without this, credentials and emails travel in plain text over the network.' },
  { icon: KeyIcon, label: 'Step 5', title: 'Authentication', desc: 'Tests your username and password. The most common failure point. Gmail requires App Passwords, not your regular login.' },
  { icon: MailCheckIcon, label: 'Step 6-8', title: 'Sender + Recipient + Close', desc: 'Verifies the server accepts your FROM address and a test recipient, then disconnects cleanly. No email is actually sent.' },
];

const COMMON_ISSUES = [
  { code: 'Connection timeout', title: 'Port blocked by ISP', fix: 'Port 25 is blocked by most residential ISPs and cloud providers. Switch to port 587 (STARTTLS) or 465 (SSL/TLS).' },
  { code: '535 5.7.8', title: 'Gmail: wrong password type', fix: 'Gmail requires an App Password when 2FA is enabled. Generate one at myaccount.google.com under Security.' },
  { code: '535 5.7.139', title: 'Microsoft 365: SMTP AUTH disabled', fix: 'SMTP AUTH is disabled by default in Exchange. Enable it in the admin center or use an App Password.' },
  { code: 'SSL handshake failed', title: 'TLS mismatch', fix: 'Try a different port and security combo. Port 465 uses implicit TLS. Port 587 uses STARTTLS. Mixing them causes failures.' },
  { code: '421 4.7.0', title: 'Rate limited', fix: 'Too many connection attempts in a short time. Wait 60 seconds and try again.' },
];

const FAQ_DATA = [
  { q: 'How do I test my SMTP connection?', a: 'Enter your SMTP host, port, username, and password above. The tester connects to your server and walks through every step of the SMTP handshake: TCP connection, server greeting, EHLO, TLS upgrade, authentication, sender verification, and recipient acceptance. You see the actual protocol exchange with plain-language explanations at each step.' },
  { q: 'What is SMTP port 587 vs 465 vs 25?', a: 'Port 587 is the standard submission port using STARTTLS (starts plain, upgrades to encrypted). Port 465 uses implicit SSL/TLS (encrypted from the start). Port 25 is the original SMTP relay port, often blocked by ISPs and cloud providers. For most users, port 587 with STARTTLS is the right choice.' },
  { q: 'Why does my SMTP authentication fail?', a: 'The most common reasons: you are using your regular password instead of an App Password (required by Gmail, Microsoft, and most providers with 2FA enabled), SMTP AUTH is disabled in your provider settings (common with Microsoft 365), or the username format is wrong (some providers want the full email, others want just the username).' },
  { q: 'What is STARTTLS?', a: 'STARTTLS is a command that upgrades a plain-text SMTP connection to an encrypted TLS connection. The connection starts unencrypted on port 587, then both sides negotiate encryption before any sensitive data (like your password) is sent. It is different from implicit TLS on port 465, where the entire connection is encrypted from the start.' },
  { q: 'Is it safe to enter SMTP credentials in an online tool?', a: 'Our SMTP tester sends your credentials over HTTPS to our server, which connects to your SMTP server to run the test. Credentials are never stored, logged, or cached. The terminal output proves transparency by showing you exactly what commands were sent. We never send an actual email during the test.' },
  { q: "Why can't I connect to SMTP on port 25?", a: 'Most residential ISPs, AWS, Google Cloud, Azure, and other cloud providers block outbound port 25 to prevent spam. Use port 587 (STARTTLS) or port 465 (SSL/TLS) instead. These ports are designed for authenticated email submission and are not blocked.' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.faqItem}>
      <button className={styles.faqQuestion} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{q}</span>
        <svg className={`${styles.faqChevron} ${open ? styles.faqChevronOpen : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className={styles.faqAnswer}>{a}</div>}
    </div>
  );
}

export default function SmtpTestPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
      <SchemaMarkup />

      <section className={styles.toolSection}>
        <SmtpTester />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>How SMTP connections work</h2>
          <p className={styles.sectionDesc}>Every email your software sends starts with an SMTP handshake. Here is what happens at each step and what can go wrong.</p>
        </div>
        <div className={styles.explainerGrid}>
          {EXPLAINER_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className={styles.explainerCard}>
                <div className={styles.explainerIcon}><Icon /></div>
                <span className={styles.explainerLabel}>{card.label}</span>
                <h3 className={styles.explainerTitle}>{card.title}</h3>
                <p className={styles.explainerDesc}>{card.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Common SMTP issues and fixes</h2>
          <p className={styles.sectionDesc}>Most SMTP failures fall into a handful of patterns. Here are the ones we see the most.</p>
        </div>
        <div className={styles.issuesList}>
          {COMMON_ISSUES.map((issue) => (
            <div key={issue.code} className={styles.issueCard}>
              <div className={styles.issueTop}>
                <span className={styles.issueCode}>{issue.code}</span>
                <span className={styles.issueTitle}>{issue.title}</span>
              </div>
              <p className={styles.issueFix}>{issue.fix}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
        </div>
        <div className={styles.faqList}>
          {FAQ_DATA.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.ctaCard}>
          <div className={styles.ctaContent}>
            <h2 className={styles.ctaTitle}>SMTP working? Check your domain next.</h2>
            <p className={styles.ctaDesc}>A working SMTP server is step one. Your domain reputation, SPF, DKIM, and DMARC records determine whether your emails land in inboxes or spam.</p>
          </div>
          <div className={styles.ctaActions}>
            <Link to="/domain" className={styles.ctaPrimary}>Check Domain Health</Link>
            <Link to="/records" className={styles.ctaSecondary}>Generate DNS Records</Link>
          </div>
        </div>
      </section>
    </main>
      <Footer />
    </>
  );
}