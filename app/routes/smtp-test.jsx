import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import SmtpTester from '~/components/tools/SmtpTester';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/smtp-test.module.css';

// /smtp-test - SMTP Connection Tester. F2.5: sticky strip + bracketless tool host + numbered labels.

export const meta = () => getSeo({
  title: 'Free SMTP Connection Tester',
  description: 'Test any SMTP server end to end. See the full protocol handshake, TLS status, and authentication result. SMTP port reference and error code lookup included. Free, no signup.',
  path: '/smtp-test',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'method', num: '02', name: 'METHOD' },
  { id: 'issues', num: '03', name: 'ISSUES' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

const EXPLAINER_CARDS = [
  { icon: PlugIcon, label: 'Step 1-2', title: 'TCP + Banner', desc: 'Connects to the server and waits for the 220 greeting. If this fails, the server is unreachable or the port is blocked.' },
  { icon: ServerIcon, label: 'Step 3', title: 'EHLO Handshake', desc: 'Identifies our client to the server and discovers its capabilities: max message size, supported extensions, and TLS availability.' },
  { icon: LockIcon, label: 'Step 4', title: 'STARTTLS / TLS', desc: 'Upgrades the connection to encrypted TLS. Without this, credentials and emails travel in plain text over the network.' },
  { icon: KeyIcon, label: 'Step 5', title: 'Authentication', desc: 'Tests your username and password. The most common failure point. Gmail requires App Passwords, not your regular login.' },
  { icon: MailCheckIcon, label: 'Step 6-8', title: 'Sender + Recipient + Close', desc: 'Verifies the server accepts your FROM address and a test recipient, then disconnects cleanly. No email is actually sent.' },
];

const PORTS = [
  {
    num: '25',
    purpose: 'Server-to-server relay',
    encryption: 'Optional STARTTLS',
    use: 'Blocked by most residential ISPs and cloud providers. Only mail servers use this in practice.',
  },
  {
    num: '587',
    purpose: 'Client mail submission',
    encryption: 'STARTTLS',
    use: 'The standard modern port for sending email from a client to your outbound server.',
  },
  {
    num: '465',
    purpose: 'Client submission (legacy)',
    encryption: 'Implicit TLS',
    use: 'Older clients that require encryption from the start. Still widely supported.',
  },
  {
    num: '2525',
    purpose: 'Alternative submission',
    encryption: 'STARTTLS',
    use: 'Common fallback when 587 is blocked. Not an official standard but widely accepted.',
  },
];

const RESPONSE_CODES = [
  {
    category: 'Success (2xx / 3xx)',
    codes: [
      { code: '220', meaning: 'Service ready', detail: 'Server accepted the TCP connection and is ready to talk.' },
      { code: '250', meaning: 'Requested action completed', detail: 'The most common success code. Command accepted, ready for the next.' },
      { code: '354', meaning: 'Start mail input', detail: 'Server is ready to receive the message body after your DATA command.' },
    ],
  },
  {
    category: 'Try again (4xx)',
    codes: [
      { code: '421', meaning: 'Service not available', detail: 'Server is rate limiting, restarting, or shutting down. Retry with backoff.' },
      { code: '450', meaning: 'Mailbox temporarily unavailable', detail: 'Recipient mailbox is locked or full. Server will queue.' },
      { code: '451', meaning: 'Local error, action aborted', detail: 'Server-side problem. Retry usually works.' },
      { code: '452', meaning: 'Insufficient system storage', detail: 'Server or mailbox out of disk space. Retry later.' },
    ],
  },
  {
    category: 'Do not retry (5xx)',
    codes: [
      { code: '500', meaning: 'Syntax error', detail: 'Command not recognized. Usually a client bug or wrong protocol.' },
      { code: '501', meaning: 'Bad arguments', detail: 'Command recognized but the parameters are malformed.' },
      { code: '502', meaning: 'Not implemented', detail: 'Server does not support this command. Older SMTP implementations.' },
      { code: '550', meaning: 'Mailbox unavailable', detail: 'Recipient does not exist or is blocking your sender.' },
      { code: '552', meaning: 'Message exceeds size limit', detail: 'Message is larger than the server accepts.' },
      { code: '554', meaning: 'Transaction failed', detail: 'Rejected by policy. Often a blocklist hit or spam signal.' },
    ],
  },
];

const COMMON_ISSUES = [
  { code: 'Connection timeout', title: 'Port blocked by ISP', fix: 'Port 25 is blocked by most residential ISPs and cloud providers. Switch to port 587 (STARTTLS) or 465 (SSL/TLS).' },
  { code: '535 5.7.8', title: 'Gmail: wrong password type', fix: 'Gmail requires an App Password when 2FA is enabled. Generate one at myaccount.google.com under Security.' },
  { code: '535 5.7.139', title: 'Microsoft 365: SMTP AUTH disabled', fix: 'SMTP AUTH is disabled by default in Exchange. Enable it in the admin center or use an App Password.' },
  { code: 'SSL handshake failed', title: 'TLS mismatch', fix: 'Try a different port and security combo. Port 465 uses implicit TLS. Port 587 uses STARTTLS. Mixing them causes failures.' },
  { code: '421 4.7.0', title: 'Rate limited', fix: 'Too many connection attempts in a short time. Wait 60 seconds and try again.' },
  { code: '550 5.7.1', title: 'Blocked by policy', fix: 'Recipient server rejected the message. Check SPF, DKIM, and DMARC alignment on the sender domain, and review sender IP reputation.' },
  { code: 'Certificate error', title: 'TLS certificate expired or invalid', fix: 'Renew the server certificate. Self-signed certificates trigger this on clients that verify the chain. Use a certificate from a trusted authority.' },
];

const FAQ_ITEMS = [
  { q: 'How do I test my SMTP connection?', a: 'Enter your SMTP host, port, username, and password above. The tester connects to your server and walks through every step of the SMTP handshake: TCP connection, server greeting, EHLO, TLS upgrade, authentication, sender verification, and recipient acceptance. You see the actual protocol exchange with plain-language explanations at each step.' },
  { q: 'What is SMTP port 587 vs 465 vs 25?', a: 'Port 587 is the standard submission port using STARTTLS (starts plain, upgrades to encrypted). Port 465 uses implicit SSL/TLS (encrypted from the start). Port 25 is the original SMTP relay port, often blocked by ISPs and cloud providers. For most users, port 587 with STARTTLS is the right choice.' },
  { q: 'Why does my SMTP authentication fail?', a: 'The most common reasons: you are using your regular password instead of an App Password (required by Gmail, Microsoft, and most providers with 2FA enabled), SMTP AUTH is disabled in your provider settings (common with Microsoft 365), or the username format is wrong (some providers want the full email, others want just the username).' },
  { q: 'What is STARTTLS?', a: 'STARTTLS is a command that upgrades a plain-text SMTP connection to an encrypted TLS connection. The connection starts unencrypted on port 587, then both sides negotiate encryption before any sensitive data (like your password) is sent. It is different from implicit TLS on port 465, where the entire connection is encrypted from the start.' },
  { q: 'Is it safe to enter SMTP credentials in an online tool?', a: 'Our SMTP tester sends your credentials over HTTPS to our server, which connects to your SMTP server to run the test. Credentials are never stored, logged, or cached. The terminal output proves transparency by showing you exactly what commands were sent. We never send an actual email during the test.' },
  { q: "Why can't I connect to SMTP on port 25?", a: 'Most residential ISPs, AWS, Google Cloud, Azure, and other cloud providers block outbound port 25 to prevent spam. Use port 587 (STARTTLS) or port 465 (SSL/TLS) instead. These ports are designed for authenticated email submission and are not blocked.' },
  { q: 'What is the difference between HELO and EHLO?', a: 'HELO is the original SMTP greeting command from RFC 821. EHLO is the extended version from RFC 2821 that lets the server advertise capabilities like SIZE, STARTTLS, AUTH, and PIPELINING. Modern SMTP clients always start with EHLO and fall back to HELO only if the server does not understand it.' },
  { q: 'What does an SMTP 550 error mean?', a: 'A 550 response means the recipient mailbox is unavailable. Common causes: the recipient address does not exist, the receiving server is blocking your sender IP or domain, or the message failed a policy check (SPF, DKIM, DMARC). The extended status code (like 5.1.1 or 5.7.1) tells you which category applies. Check the response codes reference above for details.' },
  { q: 'Why is Gmail rejecting my SMTP server?', a: 'Gmail rejects incoming SMTP for three main reasons: your sending IP has a poor reputation, your domain fails SPF or DKIM alignment, or your sending volume looks like spam. Check your domain with Google Postmaster Tools and audit SPF, DKIM, and DMARC. New sending domains often need a warm-up period before Gmail trusts them.' },
  { q: 'Does testing my SMTP send a real email?', a: 'No. The tester runs the SMTP handshake up to the RCPT TO command, verifies the server accepts a sender and recipient, then disconnects with QUIT. It never issues DATA, so no message body is ever transmitted. Your recipients see nothing.' },
];

// Inline section label (mobile + tablet). Hidden on desktop where strip takes over.
function SectionLabel({ num, name }) {
  return (
    <div className={styles.sectionLabel}>
      <span className={styles.sectionNum}>{num}</span>
      <span className={styles.sectionSlash}>/</span>
      <span className={styles.sectionName}>{name}</span>
    </div>
  );
}

// Horizontal sticky strip (desktop only).
function SectionStrip({ activeId }) {
  return (
    <div className={styles.strip} aria-hidden="true">
      <div className={`container ${styles.stripInner}`}>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`${styles.stripItem} ${activeId === s.id ? styles.stripItemActive : ''}`}
          >
            <span className={styles.stripNum}>{s.num}</span>
            <span className={styles.stripSlash}>/</span>
            <span className={styles.stripName}>{s.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function SmtpTestPage() {
  const toolRef = useReveal();
  const methodRef = useReveal();
  const methodGridRef = useReveal();
  const portsRef = useReveal();
  const codesRef = useReveal();
  const issuesRef = useReveal();
  const issuesGridRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    method: useRef(null),
    issues: useRef(null),
    answers: useRef(null),
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 }
    );
    for (const id of Object.keys(sectionRefs)) {
      const el = sectionRefs[id].current;
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'SMTP Connection Tester',
    description: 'Test your SMTP connection step by step. See the full protocol exchange, response codes, and port compatibility. Free, no account required.',
    url: 'https://trovarci.sh/smtp-test',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    creator: { '@type': 'Organization', name: 'Trovarcis', url: 'https://trovarcis.com' },
  };

  return (
    <>
      <Header />
      <SectionStrip activeId={activeId} />
      <main className={styles.page}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

        {/* Tool */}
        <section id="tool" ref={sectionRefs.tool} className={styles.toolSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="01" name="TOOL" />
            <div ref={toolRef} className={`${styles.toolHost} reveal`}>
              <SmtpTester />
            </div>
          </div>
        </section>

        {/* Method - how SMTP works, ports, response codes */}
        <section id="method" ref={sectionRefs.method} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="METHOD" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>How SMTP connections work</h2>
              <p className={styles.methodIntro}>
                SMTP (Simple Mail Transfer Protocol) is the standard mail servers use to hand off messages
                to each other. Your client speaks SMTP to your outbound server, which then speaks SMTP to the
                recipient's inbound server. Every step below has to succeed for a message to reach the mailbox.
              </p>
            </div>

            <div ref={methodGridRef} className={`${styles.explainerGrid} stagger`}>
              {EXPLAINER_CARDS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className={`${styles.explainerCard} reveal`}>
                    <div className={styles.explainerTop}>
                      <span className={styles.explainerIcon}>
                        <Icon />
                      </span>
                      <span className={styles.explainerLabel}>{item.label}</span>
                    </div>
                    <h3 className={styles.explainerTitle}>{item.title}</h3>
                    <p className={styles.explainerText}>{item.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Ports subsection */}
            <div ref={portsRef} className={`${styles.subsectionBlock} reveal`}>
              <h3 className={styles.subsectionTitle}>Common SMTP ports</h3>
              <p className={styles.subsectionIntro}>
                Modern email clients pick between four ports depending on encryption expectations and provider policy.
              </p>
              <div className={styles.portsList}>
                {PORTS.map((p) => (
                  <div key={p.num} className={styles.portsRow}>
                    <div className={styles.portsNum}>{p.num}</div>
                    <div className={styles.portsMeta}>
                      <div className={styles.portsPurpose}>{p.purpose}</div>
                      <div className={styles.portsEncryption}>{p.encryption}</div>
                      <p className={styles.portsUse}>{p.use}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Response codes reference */}
            <div ref={codesRef} className={`${styles.subsectionBlock} reveal`}>
              <h3 className={styles.subsectionTitle}>SMTP response codes reference</h3>
              <p className={styles.subsectionIntro}>
                Every SMTP response starts with a three-digit code. The first digit says whether the command
                succeeded, failed temporarily, or failed permanently. Extended status codes (like 5.7.1) narrow
                down the specific policy or delivery reason.
              </p>
              <div className={styles.codesGroups}>
                {RESPONSE_CODES.map((group) => (
                  <div key={group.category} className={styles.codesGroup}>
                    <div className={styles.codesCategory}>{group.category}</div>
                    <div className={styles.codesList}>
                      {group.codes.map((c) => (
                        <div key={c.code} className={styles.codesRow}>
                          <div className={styles.codesNum}>{c.code}</div>
                          <div className={styles.codesMeta}>
                            <div className={styles.codesMeaning}>{c.meaning}</div>
                            <p className={styles.codesDetail}>{c.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Issues - common SMTP errors and fixes */}
        <section id="issues" ref={sectionRefs.issues} className={styles.issuesSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="ISSUES" />
            <div ref={issuesRef} className={`${styles.issuesHead} reveal`}>
              <h2 className={styles.issuesTitle}>Common SMTP issues and fixes</h2>
              <p className={styles.issuesIntro}>
                Most SMTP failures fall into a handful of patterns. Here are the ones we see the most.
              </p>
            </div>

            <div ref={issuesGridRef} className={`${styles.issuesList} stagger`}>
              {COMMON_ISSUES.map((issue) => (
                <div key={issue.code} className={`${styles.issueCard} reveal`}>
                  <div className={styles.issueRail} aria-hidden="true" />
                  <div className={styles.issueBody}>
                    <div className={styles.issueTop}>
                      <span className={styles.issueCode}>{issue.code}</span>
                      <span className={styles.issueTitle}>{issue.title}</span>
                    </div>
                    <p className={styles.issueFix}>{issue.fix}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Answers - FAQ */}
        <section id="answers" ref={sectionRefs.answers} className={styles.answersSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="04" name="ANSWERS" />
            <div ref={faqRef} className={`${styles.faqHead} reveal`}>
              <h2 className={styles.faqTitle}>Frequently asked questions</h2>
            </div>
            <div className={styles.faqList}>
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <div
                    key={i}
                    className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}
                  >
                    <button
                      className={styles.faqQuestion}
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                    >
                      <span className={styles.faqDash} aria-hidden="true" />
                      <span className={styles.faqQuestionText}>{item.q}</span>
                      <span className={`${styles.faqChevron} ${isOpen ? styles.faqChevronOpen : ''}`}>
                        <ChevronIcon />
                      </span>
                    </button>
                    {isOpen && (
                      <div className={styles.faqAnswer}>
                        <p>{item.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Cross-link CTA */}
        <section className={styles.ctaSection}>
          <div className={`container ${styles.container}`}>
            <div ref={ctaRef} className={`${styles.ctaCard} reveal`}>
              <div className={styles.ctaLeft}>
                <h2 className={styles.ctaTitle}>SMTP working? Check your domain next.</h2>
                <p className={styles.ctaDesc}>
                  A working SMTP server is step one. Domain reputation, SPF, DKIM, and DMARC records determine whether your emails land in inboxes or spam.
                </p>
                <div className={styles.ctaActions}>
                  <Link to="/domain" className={styles.ctaPrimary}>Check domain health</Link>
                  <Link to="/records" className={styles.ctaSecondary}>Generate DNS records</Link>
                </div>
              </div>
              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>NEXT STEPS</div>
                <ul className={styles.ctaSpecList}>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Audit domain reputation</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Generate SPF + DKIM</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Score email content</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

// Inline SVGs

function ChevronIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
