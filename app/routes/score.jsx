import { useState, useEffect, useRef } from 'react';
import { Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import EmailScorer from '~/components/tools/EmailScorer';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import { getOptionalUser } from '~/utils/session.server';
import { CREDIT_COSTS, WELCOME_BONUS_AMOUNT } from '~/utils/creditsConfig.server';
import styles from '~/styles/modules/routes/score.module.css';

// /score - Email Scorer tool page. F2.5: corner-bracketed host card + sticky strip + numbered labels.

// Loader: fetch optional user. Page is publicly indexable; anonymous users see signup prompt on scoring.
export async function loader({ request }) {
  const user = await getOptionalUser(request);
  return {
    user: user ? { id: user.id, email: user.email, creditsBalance: user.creditsBalance } : null,
    creditCost: CREDIT_COSTS.email_score,
    welcomeBonus: WELCOME_BONUS_AMOUNT,
  };
}

export const meta = () => getSeo({
  title: 'Free Email Spam Checker | Score Your Email Before Sending',
  description: 'AI-powered email deliverability scorer. Check your subject line and email content for spam triggers, compliance issues, and formatting problems. Free, instant results.',
  path: '/score',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'method', num: '02', name: 'METHOD' },
  { id: 'answers', num: '03', name: 'ANSWERS' },
];

const FAQ_ITEMS = [
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
    a: 'Modern spam filters do not use simple keyword lists. Context matters. "Free" is fine in "Free guide to email deliverability" but risky in "FREE MONEY NOW". The scorer evaluates phrases in context, not as isolated keywords.',
  },
  {
    q: 'How many links should an email have?',
    a: 'For short emails, keep it under 3-4 links. For newsletters, under 8-10. The link-to-text ratio matters more than the absolute number. URL shorteners (bit.ly, etc.) are a strong spam signal and should be avoided in email.',
  },
  {
    q: 'How much does it cost to score an email?',
    a: 'One credit per scoring call. New accounts receive a welcome bonus of 10 credits, which covers ten scans. After that, credits are available in top-up packages at a flat rate of $0.010 per credit. If the scoring engine fails for any reason, your credit is refunded automatically.',
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

const CATEGORIES = [
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

export default function ScorePage() {
  const { user, creditCost, welcomeBonus } = useLoaderData();
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
    name: 'Email Scorer',
    description: 'AI-powered email deliverability scorer. Check your email content for spam triggers before sending. Free, no account required.',
    url: 'https://trovarci.sh/score',
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
              <EmailScorer
                isAuthed={!!user}
                initialBalance={user?.creditsBalance ?? null}
                creditCost={creditCost}
                welcomeBonus={welcomeBonus}
              />
            </div>
          </div>
        </section>

        {/* Method - how spam filters evaluate your email */}
        <section id="method" ref={sectionRefs.method} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="METHOD" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>How spam filters evaluate your email</h2>
              <p className={styles.methodIntro}>
                Modern spam filters are machine learning models, not keyword lists. They evaluate dozens of signals at once. A single "spam word" rarely matters. The combination of subject patterns, content structure, link behavior, and compliance determines whether your email reaches the inbox.
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
              Infrastructure matters too. If your domain lacks SPF, DKIM, or DMARC records, even a perfect email can land in spam. Use the <Link to="/domain" className={styles.inlineLink}>Domain Checker</Link> to verify your authentication setup.
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
                <h2 className={styles.ctaTitle}>Score good? Check your domain next.</h2>
                <p className={styles.ctaDesc}>
                  Content is half the equation. Domain authentication, reputation, and DNS configuration are the other half.
                </p>
                <div className={styles.ctaActions}>
                  <Link to="/domain" className={styles.ctaPrimary}>Check domain health</Link>
                  <Link to="/verify" className={styles.ctaSecondary}>Verify your list</Link>
                </div>
              </div>
              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>NEXT STEPS</div>
                <ul className={styles.ctaSpecList}>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Audit SPF, DKIM, DMARC</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Check blacklist status</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Clean your contact list</span>
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
