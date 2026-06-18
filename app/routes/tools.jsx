import { useState } from 'react';
import { Link } from 'react-router';
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
import styles from '~/styles/modules/routes/tools.module.css';

export const meta = () => getSeo({
  title: 'Free Email Tools',
  description: 'Free email deliverability tools. Check domain health, verify emails, test SMTP, generate DNS records, score emails for spam, and validate phone numbers.',
  path: '/tools',
});

/* ═══════════════════════════════════════════
   MINI DEMOS — animated previews per tool
   Each shows the tool's actual output.
   CSS animations only. No libraries.
   ═══════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════
   TOOL DATA
   ═══════════════════════════════════════════ */

const TOOLS = [
  {
    name: 'Email Scorer',
    href: '/score',
    icon: GaugeIcon,
    demo: ScoreDemo,
    description: 'Get a 0-100 deliverability score with specific issues and one-line fixes before you hit send.',
    tag: '3 free/day',
  },
  {
    name: 'Domain Checker',
    href: '/domain',
    icon: GlobeIcon,
    demo: DomainDemo,
    description: 'Full health report on MX, SPF, DKIM, DMARC, SSL, and blacklist status. Instant results.',
    tag: 'Unlimited',
  },
  {
    name: 'Email Verifier',
    href: '/verify',
    icon: VerifyIcon,
    demo: VerifyDemo,
    description: 'Single or bulk CSV. Cleans, validates, and verifies mailboxes all in one pass.',
    tag: '5 free/day',
  },
  {
    name: 'SMTP Tester',
    href: '/smtp-test',
    icon: TerminalIcon,
    demo: SmtpDemo,
    description: 'Test connectivity, TLS, auth, and response time. Credentials never stored or logged.',
    tag: '5 free/day',
  },
  {
    name: 'DNS Generator',
    href: '/records',
    icon: DnsIcon,
    demo: DnsDemo,
    description: 'Pick your email provider and registrar. Get copy-paste-ready SPF, DKIM, and DMARC records.',
    tag: 'Unlimited',
  },
  {
    name: 'Number Verifier',
    href: '/verify-number',
    icon: PhoneIcon,
    demo: PhoneDemo,
    description: 'Validate phone numbers. Format check, active status, carrier, and line type.',
    tag: '3 free/day',
  },
];

/* ═══════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════ */

export default function Tools() {
  const headerRef = useReveal();
  const gridRef = useReveal(0.02);
  const ctaRef = useReveal();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = 'https://trovarci.sh/tools';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
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
      <main className={styles.page}>

        <div className={`container ${styles.inner}`}>
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <p className={styles.eyebrow}>Free tools. No account needed.</p>
            <h1 className={styles.title}>Email deliverability toolkit</h1>
            <p className={styles.subtitle}>
              Six tools that help you send email that actually arrives. Check
              your domain, verify addresses, test connections, generate records.
            </p>
            <div className={styles.shareBar}>
              <button
                onClick={handleCopy}
                className={`${styles.shareButton} ${copied ? styles.shareButtonCopied : ''}`}
                type="button"
              >
                {copied ? (
                  <><CheckIcon size={14} /><span>Copied</span></>
                ) : (
                  <><CopyIcon size={14} /><span>Copy link</span></>
                )}
              </button>
              <button onClick={handleShareX} className={styles.shareButton} type="button">
                <ShareIcon size={14} />
                <span>Share on X</span>
              </button>
            </div>
          </header>
        </div>

        <div className={`container ${styles.inner}`}>
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
                      <span className={styles.cardTag}>{tool.tag}</span>
                    </div>
                    <p className={styles.cardDescription}>{tool.description}</p>
                    <span className={styles.cardCta}>
                      Try it free <ArrowRightIcon size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className={`container ${styles.inner}`}>
          <div ref={ctaRef} className={`${styles.bottomCta} reveal`}>
            <p className={styles.bottomCtaLabel}>Want more than tools?</p>
            <h3 className={styles.bottomCtaTitle}>
              Download Trovarcis Reach and send campaigns from your desktop.
            </h3>
            <p className={styles.bottomCtaText}>
              Multi-SMTP failover, AI email scoring, unlimited contacts. One-time
              purchase. Works offline.
            </p>
            <div className={styles.bottomCtaButtons}>
              <a href="/#cta" className={styles.bottomCtaButtonPrimary}>Get Early Access</a>
              <a href="/#pricing" className={styles.bottomCtaButtonSecondary}>See Pricing</a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
