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
    },
  };
}

export const meta = () => getSeo({
  title: 'Email Verifier: Check Emails Before You Send',
  description: 'Find the email addresses that would bounce before you send. Check one, or a whole list of up to 50,000. 1 credit per address, 10 free when you sign up.',
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
    title: 'Format and domain check',
    text: 'Catches typos, missing endings like .com, and domains that cannot receive email, before anything else.',
  },
  {
    icon: ProbeIcon,
    label: 'Step 2',
    title: 'Mailbox check',
    text: 'We ask the address\'s own mail server whether the mailbox exists, without sending an email.',
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
    title: 'Retries slow servers',
    text: 'Some servers ask senders to try again later. We retry automatically after 5, 15 and 60 minutes before giving a verdict.',
  },
  {
    icon: RefundIcon,
    label: 'Step 5',
    title: 'Auto-refund on failure',
    text: 'If a check fails on our side, its credit goes back to your balance automatically. You only pay for clear answers.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How accurate is email verification?',
    a: 'Most addresses get a clear answer: valid or invalid. A small share come back as unknown, usually because the mail server delays its answer or accepts every address. Those are marked so you can decide what to do with them.',
  },
  {
    q: 'What does each verdict mean?',
    a: 'Valid: the mailbox exists and accepts mail. Invalid: the address has a syntax error, the domain has no mail server, or the server explicitly rejected the recipient. Risky: deliverable but flagged (role addresses, free providers, catch-all domains). Unknown: the server would not give a yes or no, usually because it delays answers or blocked the check for a while.',
  },
  {
    q: 'How does pricing work?',
    a: 'Every address costs 1 credit, single or bulk, and a credit is a flat $0.010 at any volume. If a check fails on our side, the credit goes back to your balance automatically, so you only pay for clear answers.',
  },
  {
    q: 'Can I cancel a bulk job mid-run?',
    a: 'Yes. Cancel from the progress panel. Credits for the addresses not yet checked go back to your balance.',
  },
  {
    q: 'What happens when a server says "try again later"?',
    a: 'We retry automatically after 5, 15 and 60 minutes. If the server still will not answer, the address is marked unknown.',
  },
  {
    q: 'Do you store the email lists I upload?',
    a: 'Lists and their results are kept for 48 hours so you can download them, then deleted automatically. We never build a shared list of checked addresses.',
  },
  {
    q: 'Why is my address marked as catch-all?',
    a: 'Some domains accept mail for every address, real or not. We test this with a made-up address on the same domain. If the server accepts it, real and fake mailboxes there look the same, so those addresses are marked risky (catch-all).',
  },
];

const TIERS = [
  {
    tier: 'Single',
    title: 'Single check',
    badge: '1 CREDIT',
    desc: 'Paste one address and get a verdict in seconds, with the reason.',
    icon: MailIcon,
    checks: [
      'Format and domain check',
      'Mailbox check with the mail server',
      'Tags for role, disposable, free provider, catch-all',
      'Refunded automatically if the check fails on our side',
    ],
  },
  {
    tier: 'Bulk',
    title: 'Bulk verify',
    badge: '1 CREDIT',
    desc: 'Paste or upload up to 50,000 addresses. Watch the progress live, then download every result or only the valid addresses.',
    icon: StackIcon,
    checks: [
      'Live progress',
      'Automatic retries for slow servers',
      'Cancel anytime, unchecked addresses refunded',
      'CSV download (all results or only valid)',
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
    description: 'Find the email addresses that would bounce before you send. One at a time, or up to 50,000 per list.',
    url: 'https://trovarci.sh/verify',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0.01', priceCurrency: 'USD' },
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
              <EmailVerifier user={user} balance={balance} creditCost={costs.verify} />
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
                Single mode is instant. Bulk mode runs in the background and handles up to 50,000 addresses per job. Same 1 credit per address either way. {welcomeBonus} free credits on signup, enough for {welcomeBonus} verifications.
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
