import { useState } from 'react';
import { useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import EmailVerifier from '~/components/tools/EmailVerifier';
import { getOptionalUser } from '~/utils/session.server';
import { getCreditBalance } from '~/lib/credits.server';
import styles from '~/styles/modules/routes/verify.module.css';

/* ── Loader ──
   Page is publicly indexed so anonymous traffic lands here without a session.
   The EmailVerifier component handles both anonymous (sign-in CTA) and
   authed states from the same props. */
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
  return { user, balance };
}

/* ── SEO ── */

export function meta() {
  return [
    { title: 'Free Email Verifier - Check Deliverability and Catch-all | Trovarcis Reach' },
    { name: 'description', content: 'Verify email addresses before you send. Single check via live SMTP probe, bulk runs up to 50,000 emails per job. Refunds on infrastructure failure.' },
    { property: 'og:title', content: 'Free Email Verifier - Trovarcis Reach' },
    { property: 'og:description', content: 'Single email verification and bulk runs up to 50,000 addresses. Live SMTP probe with role, disposable, and catch-all detection.' },
    { property: 'og:url', content: 'https://trovarci.sh/verify' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Free Email Verifier - Trovarcis Reach' },
    { name: 'twitter:description', content: 'Verify single emails or run bulk lists up to 50,000. Refunded on infrastructure failure.' },
  ];
}

export function links() {
  return [{ rel: 'canonical', href: 'https://trovarci.sh/verify' }];
}

/* ── Structured Data ── */

function SchemaMarkup() {
  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Email Verifier - Trovarcis Reach',
    url: 'https://trovarci.sh/verify',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: 'Verify email addresses with live SMTP probes. Single mode and bulk verification up to 50,000 addresses per job.',
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
    tier: 'Single',
    title: 'Single check',
    badge: '1 CREDIT',
    badgeClass: 'tierBadgePaid',
    desc: 'Paste one address. We open an SMTP conversation with the destination server and ask if the mailbox exists. Verdict comes back in under 10 seconds with the full reasoning trail.',
    checks: [
      'Syntax + DNS check',
      'Live SMTP probe via SOCKS5 proxy',
      'Tags for role, disposable, free provider, catch-all',
      'Refunded automatically on infrastructure failure',
    ],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tier: 'Bulk',
    title: 'Bulk verify',
    badge: '1 CR / 5',
    badgeClass: 'tierBadgePaid',
    desc: 'Paste up to 50,000 addresses. The worker processes them in parallel and surfaces live progress. Download the full results or just the clean (valid) list when it finishes.',
    checks: [
      'Live progress via Server-Sent Events',
      'Graylist retries at 5, 15, 60 minutes',
      'Cancel anytime, partial refund for unprocessed rows',
      'CSV download (full results + clean list)',
    ],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="9" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

/* ── FAQ ──
   Pricing math at the flat $0.010 / credit rate:
     Single mode    = 1 credit  = $0.010 per email
     Bulk mode      = 1 credit per 5 emails (rounds up)
                    = $0.002 per email at the flat rate */

const FAQ_DATA = [
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

/* ── Page ── */

export default function VerifyPage() {
  const { user, balance } = useLoaderData();
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <>
      <Header />
      <SchemaMarkup />
      <main className={styles.page}>
        {/* Tool */}
        <section className={styles.toolSection}>
          <EmailVerifier user={user} balance={balance} />
        </section>

        {/* Two-tier explainer */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Two ways to verify</h2>
            <p className={styles.sectionDesc}>
              Single mode is instant - paste one address, get a verdict in under 10 seconds. Bulk mode handles up to 50,000 addresses per job and runs in the background.
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
              <h2 className={styles.ctaTitle}>List clean? Verify your phone numbers too.</h2>
              <p className={styles.ctaDesc}>
                If you are sending both email and SMS campaigns, verify both lists. Dead phone numbers waste your SMS budget the same way invalid emails hurt your sender reputation.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <a href="/verify-number" className={styles.ctaPrimary}>Verify Numbers</a>
              <a href="/credits" className={styles.ctaSecondary}>Buy Credits</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
