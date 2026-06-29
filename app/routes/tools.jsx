import { useState, useEffect, useRef } from 'react';
import { Link, useLoaderData } from 'react-router';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import {
  GaugeIcon,
  GlobeIcon,
  VerifyIcon,
  TerminalIcon,
  DnsIcon,
  PhoneIcon,
  ArrowRightIcon,
  CopyIcon,
  CheckIcon,
  ShareIcon,
} from '~/components/icons';
import { CREDIT_COSTS, WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import styles from '~/styles/modules/routes/tools.module.css';

// /tools - tool-page chrome: cycling hero demo + horizontal sticky strip + corner brackets.

export const meta = () => getSeo({
  title: 'Free Email Tools',
  description: 'Free email deliverability tools. Check domain health, verify emails, test SMTP, generate DNS records, score emails for spam, and validate phone numbers.',
  path: '/tools',
});

// Loader: expose credit config to the page so the footnote stays in sync with server truth.
export async function loader() {
  return {
    welcomeBonus: WELCOME_BONUS_AMOUNT,
    costs: {
      score: CREDIT_COSTS.email_score,
      verify: CREDIT_COSTS.email_verify,
      verifyBulkPer5: CREDIT_COSTS.email_verify_bulk_per_5,
      phone: CREDIT_COSTS.phone_verify,
    },
  };
}

const SECTIONS = [
  { id: 'toolkit', num: '01', name: 'TOOLKIT' },
  { id: 'workflow', num: '02', name: 'WORKFLOW' },
  { id: 'more', num: '03', name: 'MORE POWER' },
];

const DESKTOP_SPECS = [
  'Multi-SMTP failover',
  'AI email scoring',
  'Unlimited contacts',
  'One-time purchase',
  'Works offline',
];

// Inline section label (numbered mono). Shown on mobile + tablet, hidden on desktop where strip takes over.
function SectionLabel({ num, name }) {
  return (
    <div className={styles.sectionLabel}>
      <span className={styles.sectionNum}>{num}</span>
      <span className={styles.sectionSlash}>/</span>
      <span className={styles.sectionName}>{name}</span>
    </div>
  );
}

// Horizontal sticky strip (desktop only). Sits under header, tracks active section.
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

// Mini demos

function ScoreDemo() {
  return (
    <div className={styles.demo}>
      <div className={styles.scoreDemo}>
        <div className={styles.scoreRing}>
          <svg viewBox="0 0 80 80" className={styles.scoreRingSvg}>
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--trov-border)" strokeWidth="4.5" />
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke="var(--trov-success)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray="213.6"
              strokeDashoffset="27"
              className={styles.scoreArc}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <span className={styles.scoreValue}>87</span>
        </div>
        <div className={styles.scoreIssues}>
          <div className={styles.scoreIssue} style={{ animationDelay: '0.6s' }}>
            <span className={styles.scoreIssueDot} data-severity="success" />
            <span>Subject line</span>
          </div>
          <div className={styles.scoreIssue} style={{ animationDelay: '0.8s' }}>
            <span className={styles.scoreIssueDot} data-severity="success" />
            <span>HTML ratio</span>
          </div>
          <div className={styles.scoreIssue} style={{ animationDelay: '1.0s' }}>
            <span className={styles.scoreIssueDot} data-severity="warning" />
            <span>Unsubscribe link</span>
          </div>
          <div className={styles.scoreIssue} style={{ animationDelay: '1.2s' }}>
            <span className={styles.scoreIssueDot} data-severity="success" />
            <span>Spam triggers</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainDemo() {
  const checks = [
    { label: 'MX Records', status: 'pass' },
    { label: 'SPF Record', status: 'pass' },
    { label: 'DKIM', status: 'warn' },
    { label: 'DMARC', status: 'pass' },
    { label: 'Blacklists', status: 'pass' },
  ];
  return (
    <div className={styles.demo}>
      <div className={styles.domainDemo}>
        <div className={styles.domainInput}>
          <GlobeIcon size={11} />
          <span>trovarcis.com</span>
        </div>
        <div className={styles.domainChecks}>
          {checks.map((check, i) => (
            <div
              key={check.label}
              className={styles.domainCheck}
              style={{ animationDelay: `${0.4 + i * 0.18}s` }}
            >
              <span className={`${styles.domainCheckIcon} ${styles[`status_${check.status}`]}`}>
                {check.status === 'pass' ? '\u2713' : '!'}
              </span>
              <span className={styles.domainCheckLabel}>{check.label}</span>
              <span className={`${styles.domainCheckStatus} ${styles[`status_${check.status}`]}`}>
                {check.status === 'pass' ? 'Pass' : 'Warn'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerifyDemo() {
  return (
    <div className={styles.demo}>
      <div className={styles.verifyDemo}>
        <div className={styles.verifyHeader}>
          <span className={styles.verifyCount}>12,450</span>
          <span className={styles.verifyLabel}>emails verified</span>
        </div>
        <div className={styles.verifyBars}>
          <div className={styles.verifyBar}>
            <div className={styles.verifyBarMeta}>
              <span className={styles.verifyDot} data-type="valid" />
              <span>Valid</span>
              <span className={styles.verifyPercent}>87%</span>
            </div>
            <div className={styles.verifyBarTrack}>
              <div
                className={styles.verifyBarFill}
                data-type="valid"
                style={{ '--bar-target': '87%' }}
              />
            </div>
          </div>
          <div className={styles.verifyBar}>
            <div className={styles.verifyBarMeta}>
              <span className={styles.verifyDot} data-type="risky" />
              <span>Risky</span>
              <span className={styles.verifyPercent}>8%</span>
            </div>
            <div className={styles.verifyBarTrack}>
              <div
                className={styles.verifyBarFill}
                data-type="risky"
                style={{ '--bar-target': '8%' }}
              />
            </div>
          </div>
          <div className={styles.verifyBar}>
            <div className={styles.verifyBarMeta}>
              <span className={styles.verifyDot} data-type="invalid" />
              <span>Invalid</span>
              <span className={styles.verifyPercent}>5%</span>
            </div>
            <div className={styles.verifyBarTrack}>
              <div
                className={styles.verifyBarFill}
                data-type="invalid"
                style={{ '--bar-target': '5%' }}
              />
            </div>
          </div>
        </div>
        <div className={styles.verifyFooter}>One pass. Clean + validate + verify.</div>
      </div>
    </div>
  );
}

function SmtpDemo() {
  const lines = [
    { prefix: '$', text: 'connect smtp.resend.com:465', delay: '0.3s' },
    { prefix: '>', text: 'TLS 1.3', type: 'ok', delay: '0.7s' },
    { prefix: '>', text: 'AUTH LOGIN', type: 'ok', delay: '1.0s' },
    { prefix: '>', text: '42ms latency', type: 'ok', delay: '1.3s' },
    { prefix: '\u2713', text: 'Connection healthy', type: 'pass', delay: '1.7s' },
  ];
  return (
    <div className={styles.demo}>
      <div className={styles.smtpDemo}>
        <div className={styles.smtpBar}>
          <span className={styles.smtpWindowDot} data-c="r" />
          <span className={styles.smtpWindowDot} data-c="y" />
          <span className={styles.smtpWindowDot} data-c="g" />
        </div>
        <div className={styles.smtpLines}>
          {lines.map((line, i) => (
            <div
              key={i}
              className={`${styles.smtpLine} ${line.type === 'pass' ? styles.smtpPass : ''}`}
              style={{ animationDelay: line.delay }}
            >
              <span className={`${styles.smtpPrefix} ${line.type ? styles[`smtp_${line.type}`] : ''}`}>
                {line.prefix}
              </span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
        <div className={styles.smtpCursor} />
      </div>
    </div>
  );
}

function DnsDemo() {
  return (
    <div className={styles.demo}>
      <div className={styles.dnsDemo}>
        <div className={styles.dnsRow} style={{ animationDelay: '0.4s' }}>
          <span className={styles.dnsType}>TXT</span>
          <span className={styles.dnsLabel}>SPF</span>
          <code className={styles.dnsValue}>v=spf1 include:_spf.google.com ~all</code>
        </div>
        <div className={styles.dnsRow} style={{ animationDelay: '0.65s' }}>
          <span className={styles.dnsType}>TXT</span>
          <span className={styles.dnsLabel}>DKIM</span>
          <code className={styles.dnsValue}>v=DKIM1; k=rsa; p=MIGfMA0G...</code>
        </div>
        <div className={styles.dnsRow} style={{ animationDelay: '0.9s' }}>
          <span className={styles.dnsType}>TXT</span>
          <span className={styles.dnsLabel}>DMARC</span>
          <code className={styles.dnsValue}>v=DMARC1; p=quarantine; rua=...</code>
        </div>
        <div className={styles.dnsCopyHint} style={{ animationDelay: '1.3s' }}>
          <CopyIcon size={10} />
          <span>Copy-paste ready</span>
        </div>
      </div>
    </div>
  );
}

function PhoneDemo() {
  return (
    <div className={styles.demo}>
      <div className={styles.phoneDemo}>
        <div className={styles.phoneInput}>+1 (415) 555-0132</div>
        <div className={styles.phoneGrid}>
          <div className={styles.phoneCell} style={{ animationDelay: '0.5s' }}>
            <span className={styles.phoneCellLabel}>Status</span>
            <span className={styles.phoneCellValueGreen}>Valid</span>
          </div>
          <div className={styles.phoneCell} style={{ animationDelay: '0.65s' }}>
            <span className={styles.phoneCellLabel}>Country</span>
            <span className={styles.phoneCellValue}>US</span>
          </div>
          <div className={styles.phoneCell} style={{ animationDelay: '0.8s' }}>
            <span className={styles.phoneCellLabel}>Carrier</span>
            <span className={styles.phoneCellValue}>T-Mobile</span>
          </div>
          <div className={styles.phoneCell} style={{ animationDelay: '0.95s' }}>
            <span className={styles.phoneCellLabel}>Type</span>
            <span className={styles.phoneCellValue}>Mobile</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tool data

const TOOLS = [
  {
    name: 'Email Scorer',
    short: 'SCORER',
    href: '/score',
    icon: GaugeIcon,
    demo: ScoreDemo,
    description: 'Get a 0-100 deliverability score with specific issues and one-line fixes before you hit send.',
    tag: '1 credit',
    tagKind: 'credit',
  },
  {
    name: 'Domain Checker',
    short: 'CHECKER',
    href: '/domain',
    icon: GlobeIcon,
    demo: DomainDemo,
    description: 'Full health report on MX, SPF, DKIM, DMARC, SSL, and blacklist status. Instant results.',
    tag: 'Free',
    tagKind: 'free',
  },
  {
    name: 'Email Verifier',
    short: 'VERIFIER',
    href: '/verify',
    icon: VerifyIcon,
    demo: VerifyDemo,
    description: 'Single or bulk CSV. Cleans, validates, and verifies mailboxes all in one pass.',
    tag: '1 credit',
    tagKind: 'credit',
  },
  {
    name: 'SMTP Tester',
    short: 'SMTP',
    href: '/smtp-test',
    icon: TerminalIcon,
    demo: SmtpDemo,
    description: 'Test connectivity, TLS, auth, and response time. Credentials never stored or logged.',
    tag: 'Free',
    tagKind: 'free',
  },
  {
    name: 'DNS Generator',
    short: 'DNS',
    href: '/records',
    icon: DnsIcon,
    demo: DnsDemo,
    description: 'Pick your email provider and registrar. Get copy-paste-ready SPF, DKIM, and DMARC records.',
    tag: 'Free',
    tagKind: 'free',
  },
  {
    name: 'Number Verifier',
    short: 'NUMBER',
    href: '/verify-number',
    icon: PhoneIcon,
    demo: PhoneDemo,
    description: 'Validate phone numbers. Format check, active status, carrier, and line type.',
    tag: '2 credits',
    tagKind: 'credit',
  },
];

const CYCLE_MS = 4000;

// HeroDemo: cycles through the 6 demos. Pauses on hover. Only animates when in viewport. Static on prefers-reduced-motion.
function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [animKey, setAnimKey] = useState(0);
  const stageRef = useRef(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const prefersReduced = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || paused || !inView) return;

    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % TOOLS.length);
      setAnimKey((k) => k + 1);
    }, CYCLE_MS);
    return () => clearTimeout(id);
  }, [index, paused, inView]);

  const current = TOOLS[index];
  const Demo = current.demo;

  return (
    <div
      ref={stageRef}
      className={styles.heroDemoStage}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* keyed wrapper forces a fresh mount on cycle so the demo's internal animations replay */}
      <div key={animKey} className={styles.heroDemoFrame}>
        <Demo />
      </div>

      <div className={styles.heroDemoMeta}>
        <div className={styles.heroDemoLabel}>
          <span className={styles.heroDemoNum}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={styles.heroDemoSlash}>/</span>
          <span className={styles.heroDemoName}>{current.short}</span>
        </div>
        <div className={styles.heroDemoDots}>
          {TOOLS.map((t, i) => (
            <button
              key={t.href}
              type="button"
              onClick={() => { setIndex(i); setAnimKey((k) => k + 1); }}
              className={`${styles.heroDemoDot} ${i === index ? styles.heroDemoDotActive : ''}`}
              aria-label={`Show ${t.name} demo`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Page

export default function Tools() {
  const { welcomeBonus, costs } = useLoaderData();
  const heroRef = useReveal();
  const gridRef = useReveal(0.02);
  const ctaRef = useReveal();
  const [copied, setCopied] = useState(false);
  const [activeId, setActiveId] = useState('toolkit');
  const sectionRefs = {
    toolkit: useRef(null),
    workflow: useRef(null),
    more: useRef(null),
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

  function handleCopy() {
    const url = 'https://trovarci.sh/tools';
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShareX() {
    const text = 'Free email deliverability tools - check domains, verify emails, test SMTP, generate DNS records. No account needed.';
    const url = 'https://trovarci.sh/tools';
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  return (
    <>
      <Header />
      <SectionStrip activeId={activeId} />
      <main className={styles.page}>

        {/* Hero */}
        <section id="toolkit" ref={sectionRefs.toolkit} className={styles.heroSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="01" name="TOOLKIT" />
            <div ref={heroRef} className={`${styles.heroCard} reveal`}>
              <div className={styles.heroLeft}>
                <h1 className={styles.title}>Email deliverability toolkit</h1>
                <p className={styles.subtitle}>
                  Six tools that help you send email that actually arrives.
                </p>
                <p className={styles.subtitleMicro}>Free. No account needed.</p>
                <div className={styles.shareBar}>
                  <button
                    onClick={handleCopy}
                    className={`${styles.shareButton} ${copied ? styles.shareButtonCopied : ''}`}
                    type="button"
                  >
                    {copied ? (
                      <><CheckIcon size={13} /><span>Copied</span></>
                    ) : (
                      <><CopyIcon size={13} /><span>Copy link</span></>
                    )}
                  </button>
                  <button onClick={handleShareX} className={styles.shareButton} type="button">
                    <ShareIcon size={13} />
                    <span>Share on X</span>
                  </button>
                </div>
              </div>

              <div className={styles.heroRight}>
                <HeroDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Tool grid */}
        <section id="workflow" ref={sectionRefs.workflow} className={styles.gridSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="WORKFLOW" />
            <div ref={gridRef} className={`${styles.grid} stagger`}>
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                const Demo = tool.demo;
                return (
                  <Link key={tool.href} to={tool.href} className={`${styles.card} reveal`}>
                    <div className={styles.cardDemo}>
                      <Demo />
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardNameRow}>
                          <span className={styles.cardIcon}><Icon size={15} /></span>
                          <h2 className={styles.cardName}>{tool.name}</h2>
                        </div>
                        <span className={`${styles.cardTag} ${tool.tagKind === 'credit' ? styles.cardTagCredit : styles.cardTagFree}`}>{tool.tag}</span>
                      </div>
                      <p className={styles.cardDescription}>{tool.description}</p>
                      <span className={styles.cardCta}>
                        <span className={styles.cardCtaDash} aria-hidden="true" />
                        <span>Try it free</span>
                        <ArrowRightIcon size={13} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className={styles.gridFootnote}>
              <span className={styles.gridFootnoteDash} aria-hidden="true" />
              <span>
                <strong className={styles.gridFootnoteStrong}>{welcomeBonus} free credits on signup.</strong>
                {' '}No card. Enough for {Math.floor(welcomeBonus / costs.score)} scores, {Math.floor(welcomeBonus / costs.verifyBulkPer5) * 5} bulk verifications, or {Math.floor(welcomeBonus / costs.phone)} carrier lookups. Three tools above need no account at all.
              </span>
            </div>
          </div>
        </section>

        {/* Bottom CTA: desktop app */}
        <section id="more" ref={sectionRefs.more} className={styles.ctaSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="MORE POWER" />
            <div ref={ctaRef} className={`${styles.ctaCard} reveal`}>
              <div className={styles.ctaLeft}>
                <h3 className={styles.ctaTitle}>
                  Want more than tools?
                </h3>
                <p className={styles.ctaText}>
                  Trovarcis Reach desktop app. One-time purchase. Works offline.
                </p>
                <div className={styles.ctaButtons}>
                  <a href="/#desktop" className={styles.ctaButtonPrimary}>Get early access</a>
                  <Link to="/credits" className={styles.ctaButtonSecondary}>See pricing</Link>
                </div>
              </div>

              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>WHAT YOU GET</div>
                <ul className={styles.ctaSpecList}>
                  {DESKTOP_SPECS.map((spec) => (
                    <li key={spec} className={styles.ctaSpecItem}>
                      <span className={styles.ctaSpecMark} aria-hidden="true" />
                      <span>{spec}</span>
                    </li>
                  ))}
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
