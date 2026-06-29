import { useState, useEffect, useRef } from 'react';
import { useLoaderData, Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import EmailVerifier from '~/components/tools/EmailVerifier';
import { getOptionalUser } from '~/utils/session.server';
import { getCreditBalance } from '~/lib/credits.server';
import { CREDIT_COSTS, WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/verify.module.css';

// /verify - Email Verifier. F2.5: sticky strip + bracketless tool host + 4 sections.

export async function loader({ request }) {
  const user = await getOptionalUser(request);
  let balance = 0;
  if (user) {
    try {
      balance = await getCreditBalance(user.id);
    } catch {
      balance = 0;
    }
  }
  return {
    user,
    balance,
    welcomeBonus: WELCOME_BONUS_AMOUNT,
    costs: {
      verify: CREDIT_COSTS.email_verify,
      verifyBulkPer5: CREDIT_COSTS.email_verify_bulk_per_5,
    },
  };
}

export const meta = () => getSeo({
  title: 'Email Verifier - Single and Bulk',
  description: 'Verify email addresses before you send. Single check via live SMTP probe, bulk runs up to 50,000 emails per job. Credits refunded on infrastructure failure.',
  path: '/verify',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'method', num: '02', name: 'METHOD' },
  { id: 'tiers', num: '03', name: 'TIERS' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

const METHOD_CARDS = [
  {
    icon: SyntaxIcon,
    label: 'Step 1',
    title: 'Syntax + DNS check',
    text: 'Format validation against RFC 5321 plus MX lookup. Catches typos, missing TLDs, and domains with no mail server before we waste a probe on them.',
  },
  {
    icon: ProbeIcon,
    label: 'Step 2',
    title: 'Live SMTP probe',
    text: 'We open a real SMTP conversation with the destination server and ask if the mailbox exists. Connection goes through SOCKS5 proxies so our IP is not associated with verification traffic.',
  },
  {
    icon: TagIcon,
    label: 'Step 3',
    title: 'Classification',
    text: 'Every result is tagged: valid, invalid, risky, or unknown. Risky covers role addresses (admin@, info@), free providers, disposable domains, and catch-all servers.',
  },
  {
    icon: RetryIcon,
    label: 'Step 4',
    title: 'Graylist retries',
    text: 'Some servers respond with a temporary defer to slow down spammers. We schedule automatic retries at 5, 15, and 60 minute intervals before giving up.',
  },
  {
    icon: RefundIcon,
    label: 'Step 5',
    title: 'Auto-refund on failure',
    text: 'If a verification fails because of our infrastructure (proxy down, our timeout, our error), the credit is refunded automatically. You only pay for definitive verdicts.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How accurate is email verification?',
    a: 'For most addresses our SMTP probe returns a definitive answer: valid, invalid, or a clear classification. A small fraction come back as unknown - usually because the destination server uses graylisting or accepts every address (catch-all). We tag these so you can decide how to handle them.',
  },
  {
    q: 'What does each verdict mean?',
    a: 'Valid: the mailbox exists and accepts mail. Invalid: the address has a syntax error, the domain has no mail server, or the server explicitly rejected the recipient. Risky: deliverable but flagged (role addresses, free providers, catch-all domains). Unknown: the server would not commit to a yes or no - usually graylisting or a temporary block.',
  },
  {
    q: 'How does pricing work?',
    a: 'Single verifications cost 1 credit per scan. Bulk runs cost 1 credit per 5 emails (rounded up). At the flat rate of $0.010 per credit that works out to $0.002 per email in bulk - five times cheaper than single mode. If a verification fails because of an infrastructure issue on our side (proxy down, our timeout) the credit is refunded automatically.',
  },
  {
    q: 'Can I cancel a bulk job mid-run?',
    a: 'Yes. Click cancel on the progress panel and the worker stops claiming new items immediately. You keep credits for the rows already processed (rounded up to the nearest 5-email batch); the rest is refunded.',
  },
  {
    q: 'What happens to graylisted addresses?',
    a: 'A graylist response means try again later. The worker schedules automatic retries at 5, 15, and 60 minute intervals. If all three retries are still met with a defer, the address ends up classified as unknown rather than being charged for a definitive verdict we did not get.',
  },
  {
    q: 'Do you store the email lists I upload?',
    a: 'Job inputs and results are kept for 48 hours so you can re-download the CSV. After that they are deleted automatically. The verdicts are discarded along with the row data; we do not build a master list of verified emails across customers.',
  },
  {
    q: 'Why is my address marked as catch-all?',
    a: 'Some domains accept every address regardless of whether the mailbox exists. We detect this by probing a randomized control address on the same domain. If the server says yes to a random recipient, we cannot distinguish a real mailbox from a fake one - so we mark all of them as risky / catch-all.',
  },
];

const TIERS = [
  {
    tier: 'Single',
    title: 'Single check',
    badge: '1 CREDIT',
    desc: 'Paste one address. We open an SMTP conversation with the destination server and ask if the mailbox exists. Verdict comes back in under 10 seconds with the full reasoning trail.',
    icon: MailIcon,
    checks: [
      'Syntax + DNS check',
      'Live SMTP probe via SOCKS5 proxy',
      'Tags for role, disposable, free provider, catch-all',
      'Refunded automatically on infrastructure failure',
    ],
  },
  {
    tier: 'Bulk',
    title: 'Bulk verify',
    badge: '1 CR / 5',
    desc: 'Paste up to 50,000 addresses. The worker processes them in parallel and surfaces live progress. Download the full results or just the clean (valid) list when it finishes.',
    icon: StackIcon,
    checks: [
      'Live progress via Server-Sent Events',
      'Graylist retries at 5, 15, 60 minutes',
      'Cancel anytime, partial refund for unprocessed rows',
      'CSV download (full results + clean list)',
    ],
  },
];

function SectionLabel({ num, name }) {
  return (
    <div className={styles.sectionLabel}>
      <span className={styles.sectionNum}>{num}</span>
      <span className={styles.sectionSlash}>/</span>
      <span className={styles.sectionName}>{name}</span>
    </div>
  );
}

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

export default function VerifyPage() {
  const { user, balance, welcomeBonus, costs } = useLoaderData();
  const toolRef = useReveal();
  const methodRef = useReveal();
  const methodGridRef = useReveal();
  const tiersRef = useReveal();
  const tiersGridRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    method: useRef(null),
    tiers: useRef(null),
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
    name: 'Email Verifier',
    description: 'Verify email addresses with live SMTP probes. Single mode and bulk verification up to 50,000 addresses per job.',
    url: 'https://trovarci.sh/verify',
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
              <EmailVerifier user={user} balance={balance} />
            </div>
          </div>
        </section>

        {/* Method - how verification works */}
        <section id="method" ref={sectionRefs.method} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="METHOD" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>How email verification works</h2>
              <p className={styles.methodIntro}>
                We do not guess. Every address goes through five steps and gets a definitive verdict or a clear classification of why we could not confirm one.
              </p>
            </div>

            <div ref={methodGridRef} className={`${styles.explainerGrid} stagger`}>
              {METHOD_CARDS.map((item) => {
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
                    <p className={styles.explainerText}>{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Tiers - pricing comparison */}
        <section id="tiers" ref={sectionRefs.tiers} className={styles.tiersSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="TIERS" />
            <div ref={tiersRef} className={`${styles.tiersHead} reveal`}>
              <h2 className={styles.tiersTitle}>Two ways to verify</h2>
              <p className={styles.tiersIntro}>
                Single mode is instant. Bulk mode runs in the background and costs 5 times less per email. {welcomeBonus} free credits on signup, enough for {welcomeBonus * 5} bulk verifications or {welcomeBonus} single checks.
              </p>
            </div>

            <div ref={tiersGridRef} className={`${styles.tiersGrid} stagger`}>
              {TIERS.map((tier) => {
                const Icon = tier.icon;
                return (
                  <div key={tier.tier} className={`${styles.tierCard} reveal`}>
                    <div className={styles.tierTop}>
                      <span className={styles.tierIcon}>
                        <Icon />
                      </span>
                      <span className={styles.tierBadge}>{tier.badge}</span>
                    </div>
                    <h3 className={styles.tierTitle}>{tier.title}</h3>
                    <p className={styles.tierDesc}>{tier.desc}</p>
                    <ul className={styles.tierChecks}>
                      {tier.checks.map((check, j) => (
                        <li key={j} className={styles.tierCheck}>
                          <span className={styles.tierCheckMark} aria-hidden="true">
                            <CheckIcon />
                          </span>
                          <span>{check}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
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
                <h2 className={styles.ctaTitle}>List clean? Verify your phone numbers too.</h2>
                <p className={styles.ctaDesc}>
                  Sending both email and SMS? Dead phone numbers waste your SMS budget the same way invalid emails hurt your sender reputation.
                </p>
                <div className={styles.ctaActions}>
                  <Link to="/verify-number" className={styles.ctaPrimary}>Verify numbers</Link>
                  <Link to="/credits" className={styles.ctaSecondary}>Buy credits</Link>
                </div>
              </div>
              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>NEXT STEPS</div>
                <ul className={styles.ctaSpecList}>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Verify phone carriers</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Top up credits</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Score campaign content</span>
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

function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SyntaxIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M8 7L3 12L8 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 7L21 12L16 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4L10 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ProbeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M3 7l5-5h7l6 6-8 8-10-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 4v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefundIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="9" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
