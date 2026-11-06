import { useState, useEffect, useRef } from 'react';
import { useLoaderData, Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import NumberVerifier from '~/components/tools/NumberVerifier';
import ToolExample from '~/components/tools/ToolExample';
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
  title: 'Phone Number Verifier and Carrier Lookup',
  description: 'Check if a phone number is valid and see its country, carrier and line type: mobile, landline or VoIP. Format check free, carrier lookup 2 credits.',
  path: '/verify-number',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'example', num: '02', name: 'EXAMPLE' },
  { id: 'tiers', num: '03', name: 'TIERS' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

// The example on the page: a made-up list of 500 numbers. The rows use numbers reserved for examples.
const EXAMPLE = {
  input: 'sms-list.csv \u00b7 500 numbers',
  summary: {
    tone: 'warn',
    title: '412 can receive your texts',
    text: 'The other 88 would each cost you a text and never arrive. Download the mobiles as a new list.',
  },
  stats: [
    { label: 'Mobile', value: '412', tone: 'pass' },
    { label: 'Landline', value: '51', tone: 'warn' },
    { label: 'VoIP', value: '14', tone: 'info' },
    { label: 'Invalid', value: '23', tone: 'fail' },
  ],
  rowsLabel: 'A few of the numbers',
  rows: [
    { tone: 'pass', label: '+44 7700 900123', value: 'Mobile \u00b7 United Kingdom', note: 'A live mobile number. It can receive texts.' },
    { tone: 'warn', label: '+1 202 555 0143', value: 'Landline \u00b7 United States', note: 'A real number, but landlines can\u2019t receive texts. Call or email instead.' },
    { tone: 'info', label: '+1 415 555 0199', value: 'VoIP \u00b7 United States', note: 'An internet phone number. Some receive texts, some don\u2019t. Test a few first.' },
    { tone: 'fail', label: '+33 6 12 34 5', value: 'Invalid \u00b7 France', note: 'Too short to be a French number. Fix the typo or remove it.' },
  ],
  cost: 'Format check: free. Line type and carrier: 2 credits (2\u00a2) per number, so this list costs $10.00.',
  meanings: [
    { tone: 'pass', result: 'Mobile', means: 'A real number that can receive texts.', todo: 'Send.' },
    { tone: 'warn', result: 'Landline', means: 'A real number that can\u2019t receive texts.', todo: 'Move it to your call or email list.' },
    { tone: 'info', result: 'VoIP', means: 'An internet phone number. It may or may not receive texts.', todo: 'Test with a few before a big send.' },
    { tone: 'fail', result: 'Invalid', means: 'Can\u2019t exist in that country.', todo: 'Fix it if the typo is obvious, otherwise remove it.' },
  ],
};

const FAQ_ITEMS = [
  {
    q: 'How does phone number verification work?',
    a: 'Two levels. The free format check confirms the number is valid for its country and estimates the line type. The carrier lookup (2 credits) asks the phone network for the current carrier, the confirmed line type and whether the number can receive SMS.',
  },
  {
    q: 'What is the difference between format check and carrier lookup?',
    a: 'Format check validates whether the number matches the expected pattern for its country and gives you an estimated line type. It is free and instant. Carrier lookup contacts the actual phone network to confirm the current carrier, verified line type (mobile vs landline vs VoIP), and whether the number can receive SMS.',
  },
  {
    q: 'Can I verify phone numbers for free?',
    a: 'Yes. The format check is always free for single numbers, with the country, an estimated line type and the international format. The carrier lookup costs 2 credits per number, and new accounts get 10 free credits.',
  },
  {
    q: 'How do I verify international phone numbers?',
    a: 'Select the country from the dropdown or include the country code (like +44 for the UK or +49 for Germany). Our tool handles any format: with or without the plus sign, with or without dashes, parentheses, or spaces. Everything gets normalized to E.164.',
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
    a: 'The format check is always free. The carrier lookup costs 2 credits per number. Credits are a flat $0.010 each, and the smallest pack is $5 for 500 credits, which covers 250 carrier lookups. If a lookup fails, its credits go back to your balance automatically.',
  },
  {
    q: 'Is my phone number data stored?',
    a: 'Single checks are not saved. Bulk lists and their results are deleted 48 hours after the job is created.',
  },
];

const TIERS = [
  {
    tier: 'Free',
    title: 'Format validation',
    badge: 'FREE',
    badgeVariant: 'free',
    desc: 'Checks the format, detects the country, estimates the line type and gives the number in international format. Works however the number is written.',
    icon: ShieldCheckIcon,
    checks: [
      'Valid format for country',
      'Country detection and calling code',
      'Line type estimate (mobile, landline, VoIP)',
      'International and local format',
    ],
  },
  {
    tier: 'Credits',
    title: 'Live carrier lookup',
    badge: '2 CREDITS = 2\u00a2',
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
    desc: 'Upload up to 10,000 numbers at once. Each gets a carrier lookup, with live progress and a CSV download when it finishes.',
    icon: StackIcon,
    checks: [
      'Up to 10,000 numbers per job',
      'Live progress',
      'Cancel anytime, unchecked numbers refunded',
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

export default function VerifyNumberPage() {
  const { user, creditCost, welcomeBonus } = useLoaderData();
  const toolRef = useReveal();
  const methodRef = useReveal();
  const tiersRef = useReveal();
  const tiersGridRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    example: useRef(null),
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

        {/* Example - what a result looks like */}
        <section id="example" ref={sectionRefs.example} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="EXAMPLE" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>What you get back</h2>
              <p className={styles.methodIntro}>
                Every number gets its country, its line type and whether it can receive a text. Here is an example list of 500.
              </p>
            </div>
            <ToolExample {...EXAMPLE} />
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
