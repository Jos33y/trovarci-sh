import { useState } from 'react';
import useReveal from '~/utils/useReveal';
import { ChevronDownIcon } from '~/components/icons';
import { STORAGE_LINE, SENDER_REFUND_LINE, CREDIT_REFUND_LINE } from '~/utils/senderCopy';
import styles from '~/styles/modules/landing/FAQ.module.css';

// Answers are also the FAQPage schema, so every line here must stay true. Price comes from the loader.
function buildQuestions(priceLabel) {
  return [
    {
      q: 'What is Trovarcis Sender?',
      a: `A Windows app for sending bulk email. It sends your campaigns from your own computer, through your own SMTP accounts: Gmail, Zoho, Amazon SES, SendGrid, Brevo or your own server. One payment of ${priceLabel}, no monthly fee.`,
    },
    {
      q: 'Do you see my lists or my SMTP passwords?',
      a: `No. ${STORAGE_LINE} Mail goes straight from your computer to your own SMTP provider.`,
    },
    {
      q: 'Do I need Sender to use the tools?',
      a: 'No. The tools run here on trovarci.sh and work on their own. Domain Checker, SMTP Tester and DNS Generator are free and need no account.',
    },
    {
      q: 'What does a credit get me?',
      a: 'Each credit costs $0.010 at any volume. Email Verifier uses 1 credit per address, Email Scorer 1 credit per draft, and Number Verifier 2 credits per number. Domain Checker, SMTP Tester and DNS Generator use none.',
    },
    {
      q: 'Do credits expire?',
      a: 'Yes, 12 months after purchase.',
    },
    {
      q: "What's the difference between Email Scorer and Email Verifier?",
      a: 'Email Scorer reads a draft and flags what pushes mail into spam. Email Verifier checks whether an address exists and accepts mail. One checks the message, the other checks the list.',
    },
    {
      q: 'Is bulk verification cheaper than single?',
      a: 'Same price, 1 credit per address either way. Bulk runs in the background and takes up to 50,000 addresses per job, so use it for lists and single checks for one-off addresses.',
    },
    {
      q: 'Do you store the data I upload to the tools?',
      a: 'Verification results are saved to your account so you can download them again. Delete a job to remove its data. We do not sell or share your data.',
    },
    {
      q: 'What payment methods do you accept?',
      a: 'Crypto through Cryptomus: BTC, ETH, USDT, USDC, LTC and more. Card payments are coming.',
    },
    {
      q: "What's your refund policy?",
      a: `Sender: ${SENDER_REFUND_LINE} Write to support first so we can try to fix it with you. Credits: ${CREDIT_REFUND_LINE}`,
    },
  ];
}

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

export default function FAQ({ priceLabel }) {
  const QUESTIONS = buildQuestions(priceLabel);
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
