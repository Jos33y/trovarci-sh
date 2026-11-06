import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import DomainChecker from '~/components/tools/DomainChecker';
import ToolExample from '~/components/tools/ToolExample';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/domain.module.css';

// /domain - Domain Health Checker. F2.5: sticky strip + bracketless tool host + numbered labels.

export const meta = () => getSeo({
  title: 'Free Domain Health and Blacklist Checker',
  description: 'Check if your domain is set up to send email: SPF, DKIM, DMARC, your mail server and blocklists. Every problem comes with its fix. Free, no signup.',
  path: '/domain',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'example', num: '02', name: 'EXAMPLE' },
  { id: 'reference', num: '03', name: 'REFERENCE' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

// The example on the page: a made-up domain with two problems and a warning.
const EXAMPLE = {
  input: 'northwind-shop.com',
  summary: {
    tone: 'fail',
    title: '2 problems to fix, 1 warning',
    text: 'Fix the problems first. Each result says what to do.',
  },
  rows: [
    { tone: 'fail', label: 'DKIM', value: 'Not found', note: 'Your emails aren\u2019t signed. Turn on DKIM in your email provider\u2019s settings, then add the record it gives you.' },
    { tone: 'fail', label: 'Encryption', value: 'Off', note: 'Email to your domain travels unencrypted, and some providers refuse it. Ask your host to turn on TLS.' },
    { tone: 'warn', label: 'DMARC', value: 'p=none', note: 'Nothing stops someone from sending email pretending to be you yet. Tighten it once your own email passes.' },
    { tone: 'pass', label: 'Blocklists', value: 'Not listed', note: 'Not on any of the 6 blocklists mail providers check.' },
    { tone: 'pass', label: 'SPF', value: 'Found', note: 'Your record lists who may send email for your domain.' },
    { tone: 'pass', label: 'Mail servers', value: '2 found', note: 'Email sent to your domain has somewhere to arrive.' },
  ],
  cost: 'Free, no signup. 25 checks in about ten seconds.',
  meanings: [
    { tone: 'pass', result: 'Passed', means: 'Set up correctly.', todo: 'Nothing to do.' },
    { tone: 'warn', result: 'Warning', means: 'Works, but weaker than it should be.', todo: 'Fix it once the problems are done.' },
    { tone: 'fail', result: 'Problem', means: 'Can send your email to spam or get it refused.', todo: 'Fix it first. The result says how.' },
  ],
};

const FAQ_ITEMS = [
  {
    q: 'What does the Domain Health Checker test?',
    a: 'It checks five categories: email authentication (SPF, DKIM, DMARC, BIMI), mail server connectivity and reverse DNS, domain reputation on 6 blocklists, web security (SSL/TLS, HTTPS, security headers), and DNS configuration (nameservers, SOA, DNSSEC, CAA). Each check gets a pass, warning, or critical status with a plain-language explanation.',
  },
  {
    q: 'Is my domain information stored or shared?',
    a: 'No. Domain checks are processed in real-time and not stored on our servers. We query public DNS records and publicly accessible services. No data is retained after your session ends.',
  },
  {
    q: 'Why is my domain showing "Action Needed"?',
    a: 'Action Needed means at least one critical issue was found. Common causes include a missing DMARC record, an IP address listed on a major blacklist like Spamhaus, or an expired SSL certificate. Expand the flagged category to see the specific issue and fix instructions.',
  },
  {
    q: 'What is the difference between SPF, DKIM, and DMARC?',
    a: 'SPF specifies which servers can send email for your domain. DKIM adds a cryptographic signature to verify emails are unaltered. DMARC ties them together and tells receiving servers what to do when authentication fails. All three are required by Gmail, Yahoo, and Microsoft for reliable delivery.',
  },
  {
    q: 'How do I fix issues found by the checker?',
    a: "Each issue includes a plain-language explanation and a fix link. For authentication issues (SPF, DKIM, DMARC), the fix links directly to our DNS Record Generator with your domain pre-loaded. For blacklist issues, we link to the blacklist's removal request page.",
  },
  {
    q: 'Why does the blacklist check show "Healthy" when my emails still go to spam?',
    a: 'Blacklists are one factor in deliverability. Your domain can be clean on all blacklists but still have spam issues due to email content, engagement rates, or sending patterns. Use the Email Scorer to check your email content, and the Email Verifier to ensure your contact list is clean.',
  },
  {
    q: 'How often should I check my domain health?',
    a: 'Check after any DNS changes, after setting up a new email provider, and periodically every 1-2 months. SSL certificates expire, blacklist statuses change, and DNS records can be accidentally modified. Regular checks catch problems before they affect your email delivery.',
  },
  {
    q: 'What blacklists does the checker query?',
    a: 'Six: Spamhaus ZEN, SpamCop, Barracuda and PSBL for your mail server\'s IP address, plus Spamhaus DBL and SURBL for your domain. If you are listed, the result links to that list\'s own removal page.',
  },
  {
    q: 'What is DNSSEC and do I need it?',
    a: 'DNSSEC (RFC 4033) adds cryptographic signatures to DNS records so recipients can verify the answer came from the authoritative nameserver and was not tampered with in transit. It defends against cache poisoning and DNS hijacking. Enable it if you handle payments, healthcare data, or run a high-value domain. Most consumer sites do not require it, but the check flags whether your zone is signed and whether the chain of trust validates.',
  },
  {
    q: 'What is a soft SPF fail vs hard fail?',
    a: 'The final mechanism in your SPF record decides what receivers do with unauthorized senders. ~all (soft fail) means unauthorized mail is accepted but marked, useful during setup. -all (hard fail) means unauthorized mail is rejected, the enforcement target after monitoring. ?all (neutral) provides no protection. +all allows any sender and should never be used.',
  },
];

const CHECKS_BY_CATEGORY = [
  { category: 'Email Auth', check: 'SPF record present', validates: 'Domain has a valid v=spf1 TXT record' },
  { category: 'Email Auth', check: 'SPF lookup count', validates: 'Record stays within the 10-lookup RFC 7208 cap' },
  { category: 'Email Auth', check: 'SPF policy', validates: 'Final mechanism is ~all or -all, not +all or ?all' },
  { category: 'Email Auth', check: 'DKIM selectors', validates: 'Public keys published at common selector paths' },
  { category: 'Email Auth', check: 'DKIM key size', validates: 'Public key is 1024 bits or larger' },
  { category: 'Email Auth', check: 'DMARC record present', validates: 'Domain has a valid _dmarc TXT record' },
  { category: 'Email Auth', check: 'DMARC policy', validates: 'Policy is p=quarantine or p=reject' },
  { category: 'Email Auth', check: 'DMARC reporting', validates: 'rua= aggregate report address is set' },
  { category: 'Email Auth', check: 'BIMI', validates: 'Optional _bimi TXT record with valid logo URL' },
  { category: 'Mail Server', check: 'MX records present', validates: 'Domain publishes at least one MX record' },
  { category: 'Mail Server', check: 'MX not CNAME', validates: 'MX target is a hostname, not a CNAME chain' },
  { category: 'Mail Server', check: 'SMTP reachable', validates: 'Primary MX responds on port 25 within timeout' },
  { category: 'Mail Server', check: 'STARTTLS supported', validates: 'Server advertises STARTTLS and completes TLS handshake' },
  { category: 'Mail Server', check: 'Reverse DNS', validates: 'PTR record forward-confirms the hostname (FCrDNS)' },
  { category: 'Reputation', check: 'IP blacklists', validates: 'Sending IPs checked against public DNSBLs' },
  { category: 'Reputation', check: 'Domain blacklists', validates: 'Domain checked against Spamhaus DBL and SURBL' },
  { category: 'Reputation', check: 'Safe Browsing', validates: 'Domain not flagged as deceptive by Google' },
  { category: 'Security', check: 'SSL certificate', validates: 'Certificate chain complete and not expired' },
  { category: 'Security', check: 'HTTPS redirect', validates: 'HTTP requests redirect to HTTPS' },
  { category: 'Security', check: 'HSTS header', validates: 'Strict-Transport-Security header is present' },
  { category: 'Security', check: 'CAA records', validates: 'CAA restricts who can issue certificates' },
  { category: 'DNS Config', check: 'Nameserver redundancy', validates: 'At least two authoritative nameservers' },
  { category: 'DNS Config', check: 'Nameserver diversity', validates: 'Nameservers span multiple network prefixes' },
  { category: 'DNS Config', check: 'SOA record', validates: 'SOA present with sensible refresh, retry, expire' },
  { category: 'DNS Config', check: 'DNSSEC', validates: 'DS record present and chain of trust validates' },
];

const BLACKLISTS = [
  { name: 'Spamhaus ZEN', zone: 'zen.spamhaus.org', subject: 'IP', removal: 'Free, at check.spamhaus.org' },
  { name: 'Spamhaus DBL', zone: 'dbl.spamhaus.org', subject: 'Domain', removal: 'Free, at check.spamhaus.org' },
  { name: 'SpamCop', zone: 'bl.spamcop.net', subject: 'IP', removal: 'On the list\'s own site' },
  { name: 'Barracuda BRBL', zone: 'b.barracudacentral.org', subject: 'IP', removal: 'On the list\'s own site' },
  { name: 'PSBL', zone: 'psbl.surriel.com', subject: 'IP', removal: 'On the list\'s own site' },
  { name: 'SURBL', zone: 'multi.surbl.org', subject: 'URI', removal: 'On the list\'s own site' },
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

export default function DomainPage() {
  const toolRef = useReveal();
  const methodRef = useReveal();
  const referenceRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    example: useRef(null),
    reference: useRef(null),
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
    name: 'Domain Health Checker',
    description: 'Check if your domain is set up to send email and whether it is on a blocklist. Free, no account required.',
    url: 'https://trovarci.sh/domain',
    applicationCategory: 'UtilityApplication',
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
              <DomainChecker />
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
                Every check gets a plain result and, when something is wrong, the fix. Here is an example domain.
              </p>
            </div>
            <ToolExample {...EXAMPLE} />
          </div>
        </section>

        {/* Reference - full check list and blocklists */}
        <section id="reference" ref={sectionRefs.reference} className={styles.referenceSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="REFERENCE" />
            <div ref={referenceRef} className={`${styles.referenceHead} reveal`}>
              <h2 className={styles.referenceTitle}>Reference</h2>
              <p className={styles.referenceIntro}>
                The full list of checks by category, and the blocklists we check.
              </p>
            </div>

            <div id="checks" className={styles.refBlock}>
              <div className={styles.refBlockHead}>
                <h3 className={styles.refBlockTitle}>25+ checks by category</h3>
                <p className={styles.refBlockDesc}>
                  Every check ships with a plain-language result: pass, warning, or critical, plus a fix path.
                </p>
              </div>
              <div className={styles.refTableWrap}>
                <table className={styles.refTable}>
                  <thead>
                    <tr>
                      <th className={styles.refColCategory}>Category</th>
                      <th className={styles.refColCheck}>Check</th>
                      <th>What it validates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHECKS_BY_CATEGORY.map((row, i) => (
                      <tr key={i}>
                        <td className={styles.refCategoryCell}>{row.category}</td>
                        <td className={styles.refCheckCell}>{row.check}</td>
                        <td className={styles.refDescCell}>{row.validates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="blacklists" className={styles.refBlock}>
              <div className={styles.refBlockHead}>
                <h3 className={styles.refBlockTitle}>Blacklists we query</h3>
                <p className={styles.refBlockDesc}>
                  The public blocklists mail providers use most. If you are listed, your result links to that list's removal page.
                </p>
              </div>
              <div className={styles.refTableWrap}>
                <table className={styles.refTable}>
                  <thead>
                    <tr>
                      <th className={styles.refColName}>Blacklist</th>
                      <th className={styles.refColZone}>Zone</th>
                      <th className={styles.refColSubject}>Subject</th>
                      <th>Removal path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BLACKLISTS.map((row, i) => (
                      <tr key={i}>
                        <td className={styles.refCheckCell}>{row.name}</td>
                        <td className={styles.refZoneCell}>{row.zone}</td>
                        <td className={styles.refCategoryCell}>{row.subject}</td>
                        <td className={styles.refDescCell}>{row.removal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <h2 className={styles.ctaTitle}>Domain healthy? Test your email next.</h2>
                <p className={styles.ctaDesc}>
                  Domain checks cover infrastructure. The Email Scorer analyzes your actual email content for spam triggers.
                </p>
                <div className={styles.ctaActions}>
                  <Link to="/score" className={styles.ctaPrimary}>Score your email</Link>
                  <Link to="/records" className={styles.ctaSecondary}>Fix DNS records</Link>
                </div>
              </div>
              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>NEXT STEPS</div>
                <ul className={styles.ctaSpecList}>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Score email content</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Generate missing records</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Test SMTP connection</span>
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





