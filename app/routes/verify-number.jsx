import { useState, useEffect, useRef } from 'react';
import { useLoaderData, Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import NumberVerifier from '~/components/tools/NumberVerifier';
import { getOptionalUser } from '~/utils/session.server';
import { CREDIT_COSTS, WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/verify-number.module.css';

// /verify-number - Phone Number Verifier. F2.5: sticky strip + bracketless tool host + 4 sections.

export async function loader({ request }) {
  const user = await getOptionalUser(request);
  return {
    user: user
      ? { id: user.id, email: user.email, creditsBalance: user.creditsBalance }
      : null,
    creditCost: CREDIT_COSTS.phone_verify,
    welcomeBonus: WELCOME_BONUS_AMOUNT,
  };
}

export const meta = () => getSeo({
  title: 'Free Phone Number Verifier - Validate and Detect Carrier',
  description: 'Verify phone numbers instantly. Free format validation and country detection. Carrier lookup identifies mobile, landline, and VoIP. No subscription.',
  path: '/verify-number',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'method', num: '02', name: 'METHOD' },
  { id: 'tiers', num: '03', name: 'TIERS' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

const METHOD_CARDS = [
  {
    icon: FormatIcon,
    label: 'Step 1',
    title: 'Format validation',
    text: "Google's libphonenumber library validates the format, detects the country, and estimates the line type from the number's pattern. Free for every check. No signup needed.",
  },
  {
    icon: NormalizeIcon,
    label: 'Step 2',
    title: 'E.164 normalization',
    text: 'Strips spaces, dashes, parentheses, and other formatting noise. Returns a clean E.164 string ready for SMS APIs and phone systems that expect the international standard.',
  },
  {
    icon: CarrierIcon,
    label: 'Step 3',
    title: 'Live carrier lookup',
    text: 'Optional. Contacts the actual phone network to confirm the current carrier, verified line type (mobile vs landline vs VoIP), and whether the number can receive SMS.',
  },
  {
    icon: SmsIcon,
    label: 'Step 4',
    title: 'SMS capability flag',
    text: 'Landlines and most VoIP numbers cannot receive SMS but appear valid in format checks. Carrier lookup flags this so you can remove them from your SMS campaigns before sending.',
  },
  {
    icon: RefundIcon,
    label: 'Step 5',
    title: 'Auto-refund on failure',
    text: 'If a carrier lookup fails (rate limit, network issue, unknown number), the credit is refunded automatically. You only pay for definitive verdicts.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How does phone number verification work?',
    a: 'We run two tiers of checks. Tier 1 (free) uses Google\'s libphonenumber library to validate the format, detect the country, and estimate the line type based on number patterns. Tier 2 (2 Credits) performs a live carrier-network lookup to confirm the actual carrier, verified line type, and SMS capability.',
  },
  {
    q: 'What is the difference between format check and carrier lookup?',
    a: 'Format check validates whether the number matches the expected pattern for its country and gives you an estimated line type. It is free and instant. Carrier lookup contacts the actual phone network to confirm the current carrier, verified line type (mobile vs landline vs VoIP), and whether the number can receive SMS.',
  },
  {
    q: 'Can I verify phone numbers for free?',
    a: 'Yes. Format validation (Tier 1) is always free for single numbers. This includes country detection, line type estimation, and E.164 formatting. Live carrier lookup (Tier 2) costs 2 Credits per number. New accounts get a welcome bonus that covers your first lookups - no card required.',
  },
  {
    q: 'How do I verify international phone numbers?',
    a: 'Select the country from the dropdown or include the country code (like +44 for UK or +234 for Nigeria). Our tool handles any format: with or without the plus sign, with or without dashes, parentheses, or spaces. Everything gets normalized to E.164.',
  },
  {
    q: 'What is E.164 format?',
    a: 'E.164 is the international standard for phone number formatting. It starts with a plus sign, followed by the country code and the national number with no spaces or dashes. For example, +14155550123 for a US number or +442071234567 for a UK number. Most SMS APIs and phone systems expect numbers in this format.',
  },
  {
    q: 'Can landlines receive SMS?',
    a: 'In most countries, landlines cannot receive SMS messages. Sending SMS to a landline silently fails on most carriers, meaning your message appears sent but is never delivered. Our carrier lookup flags landlines so you can remove them from SMS campaigns.',
  },
  {
    q: 'How many credits does phone number verification cost?',
    a: 'Format validation is always free. Live carrier lookup costs 2 Credits per number. Credits are sold at a flat $0.010 each, with the smallest preset starting at $5 for 500 credits (250 carrier lookups). If a carrier lookup fails for any reason (rate limit, network issue, unknown number), the credit is refunded automatically.',
  },
  {
    q: 'Is my phone number data stored?',
    a: 'Single verification results are returned to your browser only. Nothing is stored on our servers beyond the credit ledger entry, which records the country and E.164 of carrier lookups for audit purposes. Phone numbers are never logged in plaintext beyond that.',
  },
];

const TIERS = [
  {
    tier: 'Free',
    title: 'Format validation',
    badge: 'FREE',
    badgeVariant: 'free',
    desc: "Powered by Google's libphonenumber library. Validates format, detects country, classifies line type by number pattern, and normalizes to E.164. Handles any format you throw at it.",
    icon: ShieldCheckIcon,
    checks: [
      'Valid format for country',
      'Country detection and calling code',
      'Line type estimate (mobile, landline, VoIP)',
      'E.164 and national formatting',
    ],
  },
  {
    tier: 'Credits',
    title: 'Live carrier lookup',
    badge: '2 CREDITS',
    badgeVariant: 'paid',
    desc: 'Real-time lookup via the carrier network. Confirms actual carrier, verified line type, and SMS capability. Tells you whether a number can receive your message before you spend money sending it.',
    icon: PhoneIcon,
    checks: [
      'Current carrier name',
      'Confirmed line type (not estimated)',
      'SMS capability flag',
      'Refunded automatically on lookup failure',
    ],
  },
  {
    tier: 'Bulk',
    title: 'Bulk carrier lookup',
    badge: '2 CR / NUMBER',
    badgeVariant: 'paid',
    desc: 'Upload up to 10,000 numbers at once. Same carrier-network lookup per number, runs asynchronously with live progress and a CSV download when finished. Cancel anytime, unprocessed rows refunded.',
    icon: StackIcon,
    checks: [
      'Up to 10,000 numbers per job',
      'Live progress via Server-Sent Events',
      'Cancel anytime, partial refund for unprocessed rows',
      'CSV download (full results + mobile-only list)',
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

export default function VerifyNumberPage() {
  const { user, creditCost, welcomeBonus } = useLoaderData();
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
    name: 'Phone Number Verifier',
    description: 'Verify phone numbers with format validation and live carrier lookup. Detect mobile, landline, and VoIP before sending SMS.',
    url: 'https://trovarci.sh/verify-number',
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
              <NumberVerifier
                isAuthed={!!user}
                initialBalance={user?.creditsBalance ?? null}
                creditCost={creditCost}
                welcomeBonus={welcomeBonus}
              />
            </div>
          </div>
        </section>

        {/* Method - how verification works */}
        <section id="method" ref={sectionRefs.method} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="METHOD" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>How phone verification works</h2>
              <p className={styles.methodIntro}>
                Format check is the foundation. Carrier lookup is the upgrade when you need to spend SMS budget intelligently. Both surface the same information shape so you can trust the verdict.
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

        {/* Tiers - 3 pricing tiers (Free / Credits / Bulk) */}
        <section id="tiers" ref={sectionRefs.tiers} className={styles.tiersSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="TIERS" />
            <div ref={tiersRef} className={`${styles.tiersHead} reveal`}>
              <h2 className={styles.tiersTitle}>Three tiers of verification</h2>
              <p className={styles.tiersIntro}>
                Format validation is free, no signup needed. Single carrier lookup costs 2 credits. Bulk handles up to 10,000 numbers per job at the same per-number rate. {welcomeBonus} free credits on signup cover {Math.floor(welcomeBonus / creditCost)} carrier lookups.
              </p>
            </div>

            <div ref={tiersGridRef} className={`${styles.tiersGrid} stagger`}>
              {TIERS.map((tier) => {
                const Icon = tier.icon;
                const badgeClass = tier.badgeVariant === 'free' ? styles.tierBadgeFree : styles.tierBadge;
                return (
                  <div key={tier.tier} className={`${styles.tierCard} reveal`}>
                    <div className={styles.tierTop}>
                      <span className={styles.tierIcon}>
                        <Icon />
                      </span>
                      <span className={badgeClass}>{tier.badge}</span>
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
                <h2 className={styles.ctaTitle}>Numbers clean? Verify your email list too.</h2>
                <p className={styles.ctaDesc}>
                  Sending both SMS and email campaigns? Dead email addresses hurt your sender reputation the same way invalid numbers waste your SMS budget.
                </p>
                <div className={styles.ctaActions}>
                  <Link to="/verify" className={styles.ctaPrimary}>Verify emails</Link>
                  <Link to="/score" className={styles.ctaSecondary}>Score email</Link>
                </div>
              </div>
              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>NEXT STEPS</div>
                <ul className={styles.ctaSpecList}>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Verify email addresses</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Score campaign content</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Check domain reputation</span>
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

function FormatIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NormalizeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="18" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

function CarrierIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M5 12a7 7 0 0114 0M8 12a4 4 0 018 0M11 12a1 1 0 012 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="13" cy="10" r="1" fill="currentColor" />
      <circle cx="17" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function RefundIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 4v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L4 7v5c0 4.5 3.4 8.7 8 10 4.6-1.3 8-5.5 8-10V7l-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.43a16 16 0 0 0 6.48 6.48l1.25-1.25a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="10" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="16" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
