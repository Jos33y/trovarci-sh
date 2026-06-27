import { useState } from 'react';
import useReveal from '~/utils/useReveal';
import { ChevronDownIcon } from '~/components/icons';
import styles from '~/styles/modules/landing/FAQ.module.css';

const QUESTIONS = [
  {
    q: "What does a credit get me?",
    a: "$0.01 per credit. Email scoring costs 1 credit. Single email verification costs 1 credit. Phone lookup costs 2 credits. Bulk email verification gets a 5x discount (1 credit per 5 emails). Domain Checker, SMTP Tester, and DNS Generator cost zero credits.",
  },
  {
    q: "Do credits expire?",
    a: "Yes. 12 months from purchase. You'll get email reminders before expiry so nothing slips away unused.",
  },
  {
    q: "What's the difference between Email Scorer and Email Verifier?",
    a: "Scorer grades a draft email for spam triggers, formatting issues, and missing authentication elements. Verifier checks whether an email address actually exists and accepts mail. Different jobs, different tools.",
  },
  {
    q: "Is bulk verification faster than single?",
    a: "Same speed, lower price. Bulk costs 1 credit per 5 emails. Single costs 1 credit per email. Use bulk for lists, single for ad-hoc checks.",
  },
  {
    q: "Do you store the data I upload?",
    a: "Verification results are saved to your account so you can re-download them. You can delete a job to remove its data. We don't sell or share your data with third parties.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Crypto via Cryptomus today: BTC, ETH, USDT, USDC, LTC, and more. Card payments via Stripe are coming.",
  },
  {
    q: "What's your refund policy?",
    a: "15-day money-back guarantee on unused credits. Email support@trovarci.sh and we'll process a full refund, no questions.",
  },
  {
    q: "Is there a free plan?",
    a: "Three tools cost zero credits, forever: Domain Checker, SMTP Tester, and DNS Generator. New accounts also get 10 free credits to try the paid tools.",
  },
];

function FAQItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
      <button
        className={styles.trigger}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className={styles.question}>{question}</span>
        <ChevronDownIcon
          size={18}
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      </button>
      <div className={`${styles.answer} ${isOpen ? styles.answerOpen : ''}`}>
        <p className={styles.answerText}>{answer}</p>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);
  const headingRef = useReveal();
  const listRef = useReveal(0.05);

  function handleToggle(index) {
    setOpenIndex(openIndex === index ? null : index);
  }

  // Schema markup for Google rich results
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": QUESTIONS.map((item) => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.a,
      },
    })),
  };

  return (
    <section className={styles.section}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      <div className={styles.bgRadial} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div ref={headingRef} className={`${styles.header} reveal`}>
          <div className={styles.kickerRow}>
            <span className="signal-dot signal-dot--sm" aria-hidden="true" />
            <span className={styles.kicker}>Quick answers</span>
          </div>
          <h2 className={styles.heading}>Frequently asked questions</h2>
        </div>

        <div ref={listRef} className={`${styles.list} stagger`}>
          {QUESTIONS.map((item, i) => (
            <div key={i} className="reveal">
              <FAQItem
                question={item.q}
                answer={item.a}
                isOpen={openIndex === i}
                onToggle={() => handleToggle(i)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
