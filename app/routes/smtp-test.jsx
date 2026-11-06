import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import SmtpTester from '~/components/tools/SmtpTester';
import ToolExample from '~/components/tools/ToolExample';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/smtp-test.module.css';

// /smtp-test - SMTP Connection Tester. F2.5: sticky strip + bracketless tool host + numbered labels.

export const meta = () => getSeo({
  title: 'Free SMTP Tester: Check Login, Port and TLS',
  description: 'Test any SMTP server: connection, encryption and login, each step shown in plain words. Includes a port guide and common errors. Free, no signup.',
  path: '/smtp-test',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'example', num: '02', name: 'EXAMPLE' },
  { id: 'issues', num: '03', name: 'ISSUES' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
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

// The example on the page: Gmail settings with the normal password instead of an app password.
const EXAMPLE = {
  input: 'smtp.gmail.com \u00b7 port 587',
  summary: {
    tone: 'fail',
    title: 'Connected, but the login failed',
    text: 'The server and port are right. The password is the problem.',
  },
  rows: [
    { tone: 'pass', label: 'Server found', value: 'smtp.gmail.com', note: 'The address points to a working mail server.' },
    { tone: 'pass', label: 'Connected', value: 'Port 587', note: 'The port is open and the server answered.' },
    { tone: 'pass', label: 'Encryption', value: 'On', note: 'The connection was protected before your password was sent.' },
    { tone: 'fail', label: 'Login', value: 'Error 535', note: '\u201cUsername and Password not accepted.\u201d Gmail needs an app password here, not your normal one.' },
  ],
  cost: 'Free, no signup.',
  meanings: [
    { tone: 'pass', result: 'Connected and logged in', means: 'Your settings work.', todo: 'Use them in your email app or sending software.' },
    { tone: 'fail', result: 'Can\u2019t connect', means: 'The server name or port is wrong, or a firewall blocks it.', todo: 'Check the server name, then try port 587 or 465.' },
    { tone: 'warn', result: 'No encryption', means: 'The server didn\u2019t encrypt the connection.', todo: 'Try port 465, or ask your provider which port to use.' },
    { tone: 'fail', result: 'Login failed', means: 'The server refused the username or password.', todo: 'Gmail and Microsoft accounts need an app password.' },
  ],
};

const FAQ_ITEMS = [
  {
    q: "How do I test my SMTP settings?",
    a: "Enter your server, port, username and password above and press Test. The tester connects to your server the way your email app would and shows each step: connecting, switching on encryption, logging in, and checking that the server accepts your sender and recipient. If a step fails, you see the server’s own reply and what it means.",
  },
  {
    q: "Port 587, 465 or 25: which should I use?",
    a: "Use 587 or 465. Port 587 starts plain and switches to encryption before anything private is sent (STARTTLS). Port 465 is encrypted from the first moment (SSL/TLS). Port 25 is for servers passing mail to each other, and most internet providers and cloud hosts block it. If you aren’t sure, try 587 first.",
  },
  {
    q: "Why does my SMTP login fail?",
    a: "Usually one of three things. Gmail and Microsoft accounts need an app password, not your normal one. Microsoft 365 can have SMTP sign-in turned off by whoever manages the account. Or the username is in the wrong form: most providers want your full email address.",
  },
  {
    q: "What is STARTTLS?",
    a: "A way of switching an email connection to encrypted after it starts. On port 587 the connection opens plain, then both sides agree to encrypt before your password is sent. Port 465 skips that step and is encrypted from the start. Both are safe.",
  },
  {
    q: "Is it safe to enter my SMTP password here?",
    a: "Your details go to our server over an encrypted connection, are used once to run the test, and are not saved. The steps you see on screen are exactly what was sent to your server. If you’d rather not use your main password, test with an app password and delete it afterwards.",
  },
  {
    q: "Why can’t I connect on port 25?",
    a: "Most home internet providers and cloud hosts, including AWS, Google Cloud and Azure, block port 25 to stop spam. Use 587 or 465 instead. They’re made for logging in and sending, and aren’t blocked.",
  },
  {
    q: "What is the difference between HELO and EHLO?",
    a: "Both are the first thing an email app says to a server, like a hello. EHLO is the newer version: the server answers with what it supports, such as encryption and login. Every modern email app uses EHLO.",
  },
  {
    q: "What does SMTP error 550 mean?",
    a: "The server refused the email for good. Usually the address doesn’t exist, the server is blocking your domain or server, or your email failed its checks (SPF, DKIM or DMARC). The code after it narrows it down: 5.1.1 means no such mailbox, 5.7.1 means refused by the server’s rules. The full list of codes is above.",
  },
  {
    q: "Why is Gmail rejecting my email?",
    a: "Usually one of three reasons: the server you send from has a poor reputation, your domain’s SPF or DKIM doesn’t match your From address, or you’re sending more than Gmail trusts from you yet. Check your domain with the Domain Checker and in Google Postmaster Tools, and grow a new domain’s sending slowly.",
  },
  {
    q: "Does the test send a real email?",
    a: "It can. To check that your server accepts your sender and recipient, the tester hands it a tiny message with the subject “SMTP connectivity test (no content)”. Many servers stop it there, but if yours accepts it, it is delivered to the test recipient, which is test@trovarci.sh unless you change it.",
  },
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
            tabIndex={-1}
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
    example: useRef(null),
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

        {/* Example - what a result looks like */}
        <section id="example" ref={sectionRefs.example} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="EXAMPLE" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>What you get back</h2>
              <p className={styles.methodIntro}>
                Each step of the connection gets a pass or fail, and failures come with the reason in plain words. Here is an example.
              </p>
            </div>
            <ToolExample {...EXAMPLE} />
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
                      aria-controls={`faq-${i}`}
                    >
                      <span className={styles.faqDash} aria-hidden="true" />
                      <span className={styles.faqQuestionText}>{item.q}</span>
                      <span className={`${styles.faqChevron} ${isOpen ? styles.faqChevronOpen : ''}`}>
                        <ChevronIcon />
                      </span>
                    </button>
                    <div id={`faq-${i}`} className={styles.faqAnswer} hidden={!isOpen}>
                      <p>{item.a}</p>
                    </div>
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





