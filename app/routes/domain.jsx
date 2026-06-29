import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import DomainChecker from '~/components/tools/DomainChecker';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/domain.module.css';

// /domain - Domain Health Checker. F2.5: sticky strip + bracketless tool host + numbered labels.

export const meta = () => getSeo({
  title: 'Free Domain Health Checker | Email, DNS & Reputation',
  description: "Check your domain's email authentication (SPF, DKIM, DMARC), mail server health, blacklist status, SSL security, and DNS configuration. Free, instant results.",
  path: '/domain',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'method', num: '02', name: 'METHOD' },
  { id: 'answers', num: '03', name: 'ANSWERS' },
];

const FAQ_ITEMS = [
  {
    q: 'What does the Domain Health Checker test?',
    a: 'It checks five categories: email authentication (SPF, DKIM, DMARC, BIMI), mail server connectivity and reverse DNS, domain reputation across 15+ blacklists, web security (SSL/TLS, HTTPS, security headers), and DNS configuration (nameservers, SOA, DNSSEC, CAA). Each check gets a pass, warning, or critical status with a plain-language explanation.',
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
];

const CATEGORIES = [
  {
    label: 'Email Auth',
    title: 'Authentication protects your domain from spoofing',
    icon: ShieldIcon,
    text: 'SPF, DKIM, DMARC, and BIMI work together to prove your emails are legitimate. Without them, anyone can send email pretending to be your domain.',
  },
  {
    label: 'Mail Server',
    title: 'Server health affects whether email can reach you',
    icon: ServerIcon,
    text: 'MX records tell the world where to deliver your email. SMTP connectivity, STARTTLS encryption, and reverse DNS all factor into whether other servers trust yours.',
  },
  {
    label: 'Reputation',
    title: 'Blacklists can block your email silently',
    icon: ReputationIcon,
    text: 'If your IP or domain appears on a blacklist, receiving servers may reject your email without telling you. We check 15+ major blacklists including Spamhaus, Barracuda, and SpamCop.',
  },
  {
    label: 'Security',
    title: 'SSL and security headers build trust',
    icon: LockIcon,
    text: 'A valid SSL certificate, HTTPS redirect, and security headers signal that your domain is professionally managed. This indirectly affects how email providers evaluate your trustworthiness.',
  },
  {
    label: 'DNS Config',
    title: 'DNS is the foundation everything else runs on',
    icon: DnsIcon,
    text: 'Nameserver redundancy, SOA configuration, DNSSEC, and CAA records form the infrastructure that supports all other checks. Weak DNS makes everything else unreliable.',
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
  const gridRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    method: useRef(null),
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
    description: 'Check domain email authentication, mail server health, blacklist status, SSL security, and DNS configuration. Free, no account required.',
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

        {/* Method - what we check and why */}
        <section id="method" ref={sectionRefs.method} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="METHOD" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>What we check and why it matters</h2>
              <p className={styles.methodIntro}>
                Your domain's email deliverability depends on more than just content. Authentication records, server configuration, blacklist status, and security setup all affect whether your emails reach the inbox or get silently dropped.
              </p>
              <p className={styles.methodIntro}>
                This tool runs 25+ checks across five categories in seconds. Every result includes a plain-language explanation, not just a status code, so you know exactly what's wrong and how to fix it.
              </p>
            </div>

            <div ref={gridRef} className={`${styles.explainerGrid} stagger`}>
              {CATEGORIES.map((item) => (
                <div key={item.label} className={`${styles.explainerCard} reveal`}>
                  <div className={styles.explainerTop}>
                    <span className={styles.explainerIcon}>
                      <item.icon />
                    </span>
                    <span className={styles.explainerLabel}>{item.label}</span>
                  </div>
                  <h3 className={styles.explainerTitle}>{item.title}</h3>
                  <p className={styles.explainerText}>{item.text}</p>
                </div>
              ))}
            </div>

            <p className={styles.methodOutro}>
              Issues found link directly to the tool that fixes them. Missing DMARC? The <Link to="/records" className={styles.inlineLink}>DNS Generator</Link> creates the record. Blacklisted IP? We link to the removal page. Every result is actionable.
            </p>
          </div>
        </section>

        {/* Answers - FAQ */}
        <section id="answers" ref={sectionRefs.answers} className={styles.answersSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="ANSWERS" />
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

function ShieldIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L4 7v5c0 4.5 3.4 8.7 8 10 4.6-1.3 8-5.5 8-10V7l-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="7.5" r="1" fill="currentColor" />
      <circle cx="7" cy="16.5" r="1" fill="currentColor" />
      <path d="M11 7.5h6M11 16.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ReputationIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

function DnsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 12h18M12 3c-2.5 2.5-4 5.5-4 9s1.5 6.5 4 9c2.5-2.5 4-5.5 4-9s-1.5-6.5-4-9z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
