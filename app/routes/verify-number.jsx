import { useState } from 'react';
import { useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import NumberVerifier from '~/components/tools/NumberVerifier';
import { getOptionalUser } from '~/utils/session.server';
import { CREDIT_COSTS, WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import styles from '~/styles/modules/routes/verify-number.module.css';

/* ── Loader ──
   Page is publicly indexed so search traffic lands here without a session.
   The component handles both anonymous (free Tier 1, signup-prompt for
   Tier 2) and authed states from the same props. */
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

/* ── SEO ── */

export function meta() {
  return [
    { title: 'Free Phone Number Verifier - Validate and Detect Carrier | Trovarcis Reach' },
    { name: 'description', content: 'Verify phone numbers instantly. Free format validation and country detection. Carrier lookup identifies mobile, landline, and VoIP. No subscription.' },
    { property: 'og:title', content: 'Free Phone Number Verifier - Trovarcis Reach' },
    { property: 'og:description', content: 'Validate phone numbers, detect carriers, and identify SMS-capable numbers. Format check is always free.' },
    { property: 'og:url', content: 'https://trovarci.sh/verify-number' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Free Phone Number Verifier - Trovarcis Reach' },
    { name: 'twitter:description', content: 'Validate phone numbers and detect carriers before sending SMS. Free format check. Carrier lookup with Credits.' },
  ];
}

export function links() {
  return [{ rel: 'canonical', href: 'https://trovarci.sh/verify-number' }];
}

/* ── Structured Data ── */

function SchemaMarkup() {
  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Phone Number Verifier - Trovarcis Reach',
    url: 'https://trovarci.sh/verify-number',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: 'Verify phone numbers with free format validation and optional carrier lookup. Detect mobile, landline, and VoIP numbers before sending SMS.',
  };

  const faqItems = FAQ_DATA.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  }));

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
}

/* ── Tier explainer cards ── */

const TIERS = [
  {
    tier: 'Free',
    title: 'Format Validation',
    badge: 'FREE',
    badgeClass: 'tierBadgeFree',
    desc: 'Powered by Google\'s libphonenumber library. Validates format, detects country, classifies line type by number pattern, and normalizes to E.164 format. Handles any format you throw at it.',
    checks: [
      'Valid format for country',
      'Country detection and calling code',
      'Line type estimate (mobile, landline, VoIP)',
      'E.164 and national formatting',
    ],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    tier: 'Credits',
    title: 'Live Carrier Lookup',
    badge: '2 CREDITS',
    badgeClass: 'tierBadgePaid',
    desc: 'Real-time lookup via Twilio. Confirms actual carrier, verified line type, and SMS capability. Tells you whether a number can receive your message before you spend money sending it.',
    checks: [
      'Current carrier name',
      'Confirmed line type (not estimated)',
      'SMS capability flag',
      'Refunded automatically on lookup failure',
    ],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.43a16 16 0 0 0 6.48 6.48l1.25-1.25a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    tier: 'Bulk',
    title: 'Bulk Carrier Lookup',
    badge: '2 CR / NUMBER',
    badgeClass: 'tierBadgePaid',
    desc: 'Upload up to 10,000 numbers at once. Same Twilio carrier lookup per number, runs asynchronously with live progress and a CSV download when finished. Cancel anytime; unprocessed rows are refunded.',
    checks: [
      'Up to 10,000 numbers per job',
      'Live progress via Server-Sent Events',
      'Cancel anytime, partial refund for unprocessed rows',
      'CSV download (full results + mobile-only list)',
    ],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="10" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="16" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

/* ── FAQ ──
   Note: stale "3 free lookups per day" copy was removed when the Email
   Scorer pivoted to signup-required + welcome credits. Tier 2 is now
   gated behind sign-up; the welcome bonus pays for the first lookups. */

const FAQ_DATA = [
  {
    q: 'How does phone number verification work?',
    a: 'We run two tiers of checks. Tier 1 (free) uses Google\'s libphonenumber library to validate the format, detect the country, and estimate the line type based on number patterns. Tier 2 (2 Credits) performs a live carrier lookup via Twilio to confirm the actual carrier, verified line type, and SMS capability.',
  },
  {
    q: 'What\'s the difference between format check and carrier lookup?',
    a: 'Format check validates whether the number matches the expected pattern for its country and gives you an estimated line type. It\'s free and instant. Carrier lookup contacts the actual phone network to confirm the current carrier, verified line type (mobile vs landline vs VoIP), and whether the number can receive SMS.',
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

/* ── Page ── */

export default function VerifyNumberPage() {
  const { user, creditCost, welcomeBonus } = useLoaderData();
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <>
      <Header />
      <SchemaMarkup />
      <main className={styles.page}>
        {/* Tool */}
        <section className={styles.toolSection}>
          <NumberVerifier
            isAuthed={!!user}
            initialBalance={user?.creditsBalance ?? null}
            creditCost={creditCost}
            welcomeBonus={welcomeBonus}
          />
        </section>

        {/* Two-tier explainer */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Three tiers of verification</h2>
            <p className={styles.sectionDesc}>
              Format validation is free. Single carrier lookup costs 2 credits. Bulk handles up to 10,000 numbers per job at the same per-number rate.
            </p>
          </div>

          <div className={styles.tiersGrid}>
            {TIERS.map((tier) => (
              <div key={tier.tier} className={styles.tierCard}>
                <div className={styles.tierTop}>
                  <span className={styles.tierIcon}>{tier.icon}</span>
                  <span className={`${styles.tierBadge} ${styles[tier.badgeClass]}`}>{tier.badge}</span>
                </div>
                <h3 className={styles.tierTitle}>{tier.title}</h3>
                <p className={styles.tierDesc}>{tier.desc}</p>
                <ul className={styles.tierChecks}>
                  {tier.checks.map((check, j) => (
                    <li key={j} className={styles.tierCheck}>
                      <span className={styles.checkMark}>{'\u2713'}</span>
                      {check}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
          </div>
          <div className={styles.faqList}>
            {FAQ_DATA.map((item, i) => (
              <div key={i} className={styles.faqItem}>
                <button
                  className={styles.faqQuestion}
                  onClick={() => toggleFaq(i)}
                  aria-expanded={openFaq === i}
                >
                  {item.q}
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    className={`${styles.faqChevron} ${openFaq === i ? styles.faqChevronOpen : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className={styles.faqAnswer}>{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className={styles.section}>
          <div className={styles.ctaCard}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Numbers clean? Verify your email list too.</h2>
              <p className={styles.ctaDesc}>
                If you're sending both SMS and email campaigns, verify both lists. Dead email addresses hurt your sender reputation the same way invalid numbers waste your SMS budget.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <a href="/verify" className={styles.ctaPrimary}>Verify Emails</a>
              <a href="/score" className={styles.ctaSecondary}>Score Email</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
