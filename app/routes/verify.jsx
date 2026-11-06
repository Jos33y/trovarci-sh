import { useState, useEffect, useRef } from 'react';
import { useLoaderData, Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import EmailVerifier from '~/components/tools/EmailVerifier';
import ToolExample from '~/components/tools/ToolExample';
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
  { id: 'example', num: '02', name: 'EXAMPLE' },
  { id: 'tiers', num: '03', name: 'TIERS' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

// The example list on the page. Example addresses only; the numbers add up to 1,000.
const EXAMPLE = {
  input: 'customers.csv \u00b7 1,000 addresses',
  summary: {
    tone: 'warn',
    title: '843 safe to send, 157 to sort out first',
    text: 'Download only the safe addresses as a new list, or every address with its result and reason.',
  },
  stats: [
    { label: 'Valid', value: '843', tone: 'pass' },
    { label: 'Invalid', value: '61', tone: 'fail' },
    { label: 'Risky', value: '74', tone: 'warn' },
    { label: 'Unknown', value: '22', tone: 'info' },
  ],
  rowsLabel: 'A few of the addresses',
  rows: [
    { tone: 'pass', label: 'anna.lee@northwind.example', value: 'Valid', note: 'The mailbox exists. Safe to send.' },
    { tone: 'fail', label: 'j.smiht@northwind.example', value: 'Invalid', note: 'No such mailbox. Sending to it would bounce.' },
    { tone: 'warn', label: 'info@harbor.example', value: 'Risky, shared inbox', note: 'A shared inbox like info@ or sales@. It works, but no one person reads it.' },
    { tone: 'warn', label: 'sam@lakeside.example', value: 'Risky, can\u2019t confirm', note: 'This company\u2019s server accepts any address, so this one can\u2019t be confirmed.' },
    { tone: 'info', label: 'mia@quietmail.example', value: 'Unknown', note: 'The server wouldn\u2019t say yes or no. Check it again later, or leave it out.' },
  ],
  cost: 'This list costs 1,000 credits ($10.00). If a check fails on our side, its credit comes back automatically.',
  meanings: [
    { tone: 'pass', result: 'Valid', means: 'The mailbox exists and accepts email.', todo: 'Send.' },
    { tone: 'fail', result: 'Invalid', means: 'A typo, a domain that can\u2019t receive email, or a mailbox that doesn\u2019t exist.', todo: 'Remove it. Every one would bounce.' },
    { tone: 'warn', result: 'Risky', means: 'Real, but flagged: a shared inbox, a throwaway inbox, or a server that accepts any address.', todo: 'Keep the ones you know. Drop throwaway inboxes.' },
    { tone: 'info', result: 'Unknown', means: 'The server wouldn\u2019t give a yes or no.', todo: 'Check again later, or leave it out of this send.' },
  ],
};

const FAQ_ITEMS = [
  {
    q: "How accurate is email verification?",
    a: "Most addresses get a clear answer: valid or invalid. A small share come back as unknown, usually because the mail server delays its answer or won’t say whether a mailbox exists. Those are marked so you can decide what to do with them.",
  },
  {
    q: "What does each result mean?",
    a: "Valid: the mailbox exists and accepts email. Invalid: a typo, a domain that can’t receive email, or a mailbox that doesn’t exist. Risky: real, but flagged, such as shared inboxes (info@), throwaway inboxes, free email addresses in a business list, or servers that accept any address. Unknown: the server wouldn’t give a yes or no.",
  },
  {
    q: "How much does it cost?",
    a: "1 credit (1¢) per address, one at a time or in a list. 1,000 addresses cost $10 and 10,000 cost $100. New accounts get 10 free credits. If a check fails on our side, its credit comes back automatically.",
  },
  {
    q: "Will the person get an email when I check their address?",
    a: "No. The check asks the mail server whether the mailbox exists and stops before any email is sent. It runs from our servers, so it can’t affect your own email’s reputation either.",
  },
  {
    q: "Can I cancel a list part way through?",
    a: "Yes. Cancel from the progress panel. Credits for the addresses not yet checked go back to your balance.",
  },
  {
    q: "What happens when a server says “try again later”?",
    a: "In a list, we try again automatically after 5, 15 and 60 minutes. If the server still won’t answer, the address is marked unknown. For a single address, you see “try again later” and can check it again yourself.",
  },
  {
    q: "Do you store the email lists I upload?",
    a: "Lists and their results are kept for 48 hours so you can download them, then deleted automatically. We never build a shared list of checked addresses.",
  },
  {
    q: "Why is an address marked as catch-all?",
    a: "Some company mail servers accept email for every address, real or not. We test this with a made-up address at the same domain. If that is accepted too, real and fake mailboxes there look the same, so those addresses are marked risky.",
  },
];

const TIERS = [
  {
    tier: 'Single',
    title: 'One address',
    badge: '1 CREDIT = 1\u00a2',
    desc: 'Paste one address and get the answer in seconds, with the reason.',
    icon: MailIcon,
    checks: [
      'Is it written correctly, and can the domain receive email?',
      'Does the mailbox exist? We ask its mail server',
      'Flags shared, throwaway and accept-everything inboxes',
      'Credit returned if the check fails on our side',
    ],
  },
  {
    tier: 'Bulk',
    title: 'A whole list',
    badge: '1 CREDIT = 1\u00a2',
    desc: 'Paste or upload up to 50,000 addresses. Watch it work, then download every result or only the safe addresses.',
    icon: StackIcon,
    checks: [
      'Progress as each address is checked',
      'Slow servers tried again automatically',
      'Stop any time; credits for unchecked addresses come back',
      'Download as a spreadsheet (CSV): all results, or only the safe ones',
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

        {/* Example - what a result looks like */}
        <section id="example" ref={sectionRefs.example} className={styles.methodSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="02" name="EXAMPLE" />
            <div ref={methodRef} className={`${styles.methodHead} reveal`}>
              <h2 className={styles.methodTitle}>What you get back</h2>
              <p className={styles.methodIntro}>
                Every address gets a result and a reason in plain words. Here is an example list of 1,000.
              </p>
            </div>
            <ToolExample {...EXAMPLE} />
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
