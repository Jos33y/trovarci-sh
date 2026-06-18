import { useState } from 'react';
import { useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import EmailScorer from '~/components/tools/EmailScorer';
import { Link } from 'react-router';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import { getOptionalUser } from '~/utils/session.server';
import { CREDIT_COSTS, WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import styles from '~/styles/modules/routes/score.module.css';

/* Loader: fetch the user if a session exists, otherwise null. The page
   stays publicly reachable so search engines can index it, and anonymous
   visitors see a sign-up prompt when they try to score. */
export async function loader({ request }) {
  const user = await getOptionalUser(request);
  return {
    user: user ? { id: user.id, email: user.email, creditsBalance: user.creditsBalance } : null,
    creditCost: CREDIT_COSTS.email_score,
    welcomeBonus: WELCOME_BONUS_AMOUNT,
  };
}

export const meta = () => {
  return getSeo({
    title: 'Free Email Spam Checker | Score Your Email Before Sending',
    description: 'AI-powered email deliverability scorer. Check your subject line and email content for spam triggers, compliance issues, and formatting problems. Free, instant results.',
    path: '/score',
  });
};

const faqItems = [
  {
    q: 'How does the email spam checker work?',
    a: 'The Email Scorer sends your content to Arcis, our AI analysis engine powered by Claude. Unlike keyword-based tools, Arcis reads your email the way a modern spam filter does, evaluating context, structure, links, and compliance together. It returns a 0-100 score with specific issues and fixes.',
  },
  {
    q: 'What is a good email deliverability score?',
    a: 'A score of 90-100 means excellent inbox placement confidence. 70-89 is good with minor improvements possible. Below 70 means your email has issues that increase the risk of landing in spam. The score breaks down into five categories so you can see exactly where to improve.',
  },
  {
    q: 'Why do my emails go to spam even with SPF and DKIM?',
    a: 'Authentication (SPF, DKIM, DMARC) is only half the equation. Modern spam filters also evaluate your email content, structure, link patterns, and compliance. A fully authenticated domain can still land in spam if the email content triggers Bayesian filters. This tool checks the content side.',
  },
  {
    q: 'What words trigger spam filters?',
    a: 'Modern spam filters do not use simple keyword lists. Context matters. "Free" is fine in "Free guide to email deliverability" but risky in "FREE MONEY NOW!!!" The scorer evaluates phrases in context, not as isolated keywords.',
  },
  {
    q: 'How many links should an email have?',
    a: 'For short emails, keep it under 3-4 links. For newsletters, under 8-10. The link-to-text ratio matters more than the absolute number. URL shorteners (bit.ly, etc.) are a strong spam signal and should be avoided in email.',
  },
  {
    q: 'How much does it cost to score an email?',
    a: 'One credit per scoring call. New accounts receive a welcome bonus of 10 credits, which covers ten scans. After that, credits are available in top-up packages at a flat rate of $0.010 per credit (so 10 scans cost $0.10, 100 scans cost $1, 500 scans cost $5). If the scoring engine fails for any reason, your credit is refunded automatically.',
  },
  {
    q: 'Does the email scorer store my email content?',
    a: 'No. Your email content is sent to the Arcis scoring engine, processed, scored, and immediately discarded. We do not log, store, or cache any email content. Anthropic (the AI provider) does not train on API inputs.',
  },
  {
    q: 'What is Arcis?',
    a: 'Arcis is the Trovarcis Reach AI scoring engine. It uses Claude (by Anthropic) to analyze email content for deliverability issues. Think of it as a spam filter expert that reads your email before you send it and tells you what to fix.',
  },
];

const categoryExplainers = [
  {
    label: 'Subject',
    title: 'Subject lines get judged in milliseconds',
    icon: SubjectIcon,
    text: 'Length, urgency signals, ALL CAPS, and deceptive patterns like fake "RE:" prefixes. Spam filters evaluate your subject line before anything else.',
  },
  {
    label: 'Content',
    title: 'Body copy is read by machines first',
    icon: ContentIcon,
    text: 'Spam phrase density in context, reading level, personalization, and formatting abuse. Modern filters use ML to understand tone, not just keywords.',
  },
  {
    label: 'Structure',
    title: 'HTML ratio signals professionalism',
    icon: StructureIcon,
    text: 'Text-to-HTML ratio, image-to-text balance, alt text on images, and responsive design hints. Image-only emails are a strong spam signal.',
  },
  {
    label: 'Links',
    title: 'Every link is a trust signal',
    icon: LinksIcon,
    text: 'Number of links, URL shorteners, suspicious domains, and CTA clarity. Too many links in a short email pattern-matches promotional spam.',
  },
  {
    label: 'Compliance',
    title: 'Missing requirements trigger instant filtering',
    icon: ComplianceIcon,
    text: 'Unsubscribe link, physical address, from name consistency, and CAN-SPAM/GDPR signals. Gmail penalizes missing unsubscribe links directly.',
  },
];

export default function ScorePage() {
  const { user, creditCost, welcomeBonus } = useLoaderData();
  const contentRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Email Scorer',
    description: 'AI-powered email deliverability scorer. Check your email content for spam triggers before sending. Free, no account required.',
    url: 'https://trovarci.sh/score',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    creator: {
      '@type': 'Organization',
      name: 'Trovarcis',
      url: 'https://trovarcis.com',
    },
  };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />

        {/* Tool IS the hero */}
        <section className={styles.toolSection}>
          <div className="container">
            <EmailScorer
              isAuthed={!!user}
              initialBalance={user?.creditsBalance ?? null}
              creditCost={creditCost}
              welcomeBonus={welcomeBonus}
            />
          </div>
        </section>

        {/* SEO Content */}
        <section className={styles.contentSection}>
          <div className="container container--narrow" ref={contentRef}>
            <h2 className={styles.contentTitle}>How spam filters evaluate your email</h2>
            <p className={styles.contentIntro}>
              Modern spam filters are machine learning models, not keyword lists. They evaluate your email across dozens of signals simultaneously. A single "spam word" rarely matters. The combination of subject line patterns, content structure, link behavior, and compliance signals determines whether your email reaches the inbox.
            </p>
            <p className={styles.contentIntro}>
              The Email Scorer checks the five categories that matter most. Each issue includes a plain-language explanation and a specific fix.
            </p>

            <div className={styles.explainerGrid}>
              {categoryExplainers.map((item) => (
                <div key={item.label} className={styles.explainerCard}>
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

            <p className={styles.contentOutro}>
              Infrastructure matters too. If your domain lacks SPF, DKIM, or DMARC records, even a perfect email can land in spam. Use the Domain Checker to verify your authentication setup.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.faqSection}>
          <div className="container container--narrow" ref={faqRef}>
            <h2 className={styles.faqTitle}>Frequently asked questions</h2>
            <div className={styles.faqList}>
              {faqItems.map((item, i) => {
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
                      <span>{item.q}</span>
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

        {/* CTA */}
        <section className={styles.ctaSection}>
          <div className="container" ref={ctaRef}>
            <div className={styles.ctaCard}>
              <div className={styles.ctaContent}>
                <h2 className={styles.ctaTitle}>Score good? Check your domain next.</h2>
                <p className={styles.ctaDesc}>
                  Content is half the equation. Domain authentication, reputation, and DNS configuration are the other half.
                </p>
              </div>
              <div className={styles.ctaActions}>
                <Link to="/domain" className={styles.ctaPrimary}>
                  Check Domain Health
                </Link>
                <Link to="/verify" className={styles.ctaSecondary}>
                  Verify Your List
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/* -- Inline SVGs for explainer cards -- */

function ChevronIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SubjectIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9h10M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ContentIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M4 10h16M4 14h12M4 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StructureIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="14" width="18" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function LinksIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ComplianceIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}