import { useState, useEffect, useRef } from 'react';
import { Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import EmailScorer from '~/components/tools/EmailScorer';
import ToolExample from '~/components/tools/ToolExample';
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
  title: 'Email Spam Checker: Score Before You Send',
  description: 'Paste your email and get a spam score from 0 to 100, with what to fix in the subject, wording, links and layout. 10 free scores when you sign up.',
  path: '/score',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'example', num: '02', name: 'EXAMPLE' },
  { id: 'answers', num: '03', name: 'ANSWERS' },
];

// The example on the page: a made-up promotional email and what the scorer says about it.
const EXAMPLE = {
  input: 'Subject: Last chance: 50% off ends tonight',
  summary: {
    tone: 'warn',
    title: '64 out of 100: needs work',
    text: 'Three problems found. Fix them and score it again before you send.',
  },
  rowsLabel: 'What it found',
  rows: [
    { tone: 'fail', label: 'No unsubscribe link', value: 'Rules', note: 'Gmail and Yahoo expect one in bulk email. Add a link that unsubscribes in one click.' },
    { tone: 'warn', label: 'Subject reads like an ad', value: 'Subject', note: '\u201cLast chance\u201d plus a discount is what promotions look like. Say what\u2019s inside instead.' },
    { tone: 'warn', label: 'Shortened link', value: 'Links', note: 'Short links like bit.ly hide where they go, and spam filters distrust them. Use the full address.' },
    { tone: 'pass', label: 'Text and images balanced', value: 'Layout', note: 'There\u2019s enough text that the email still reads well with images turned off.' },
  ],
  cost: '1 credit (1\u00a2) per email scored. New accounts get 10 free.',
  meaningsTitle: 'What the score means',
  meanings: [
    { tone: 'pass', result: '90 to 100: excellent', means: 'Reads like an email people want.', todo: 'Send.' },
    { tone: 'pass', result: '70 to 89: good', means: 'Small things could be better.', todo: 'Fix what\u2019s listed if it\u2019s quick, then send.' },
    { tone: 'warn', result: '50 to 69: needs work', means: 'Some of it looks like spam to a filter.', todo: 'Fix the problems listed and score it again.' },
    { tone: 'fail', result: 'Below 50: poor', means: 'Likely to land in spam.', todo: 'Rewrite it before you send.' },
  ],
};

const FAQ_ITEMS = [
  {
    q: 'How does the email spam checker work?',
    a: 'Paste your subject and your email. It is read the way a modern spam filter reads it: wording in context, structure, links and the details mail providers require. You get a score from 0 to 100, the problems it found, and how to fix each one.',
  },
  {
    q: 'What is a good email deliverability score?',
    a: 'A score of 90-100 means excellent inbox placement confidence. 70-89 is good with minor improvements possible. Below 70 means your email has issues that increase the risk of landing in spam. The score breaks down into five categories so you can see exactly where to improve.',
  },
  {
    q: 'Why do my emails go to spam even with SPF and DKIM?',
    a: 'Authentication (SPF, DKIM, DMARC) is only half the equation. Modern spam filters also evaluate your email content, structure, link patterns, and compliance. A fully authenticated domain can still land in spam if the content looks like spam to a filter. This tool checks the content side.',
  },
  {
    q: 'What words trigger spam filters?',
    a: 'Modern spam filters do not use simple keyword lists. Context matters. "Free" is fine in "Free guide to email deliverability" but risky in "FREE MONEY NOW". The scorer evaluates phrases in context, not as isolated keywords.',
  },
  {
    q: 'How many links should an email have?',
    a: 'As few as the email needs. A short message with one or two links reads like a person wrote it, while a long run of links reads like a campaign. Avoid link shorteners such as bit.ly, which spam filters distrust.',
  },
  {
    q: 'How much does it cost to score an email?',
    a: 'One credit per scoring call. New accounts receive a welcome bonus of 10 credits, which covers ten scans. After that, credits are available in top-up packages at a flat rate of $0.010 per credit. If the scoring engine fails for any reason, your credit is refunded automatically.',
  },
  {
    q: 'Does the email scorer store my email content?',
    a: 'No. Your email is scored and then discarded. We do not store or log its content.',
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

export default function ScorePage() {
  const { user, creditCost, welcomeBonus } = useLoaderData();
  const toolRef = useReveal();
  const methodRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    example: useRef(null),
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
    description: 'Score an email for spam problems before you send it, with what to fix.',
    url: 'https://trovarci.sh/score',
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
              <EmailScorer
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
                A score out of 100, every problem found and how to fix each one. Here is an example.
              </p>
            </div>
            <ToolExample {...EXAMPLE} />
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





