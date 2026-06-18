import { useState } from 'react';
import useReveal from '~/utils/useReveal';
import { ChevronDownIcon } from '~/components/icons';
import styles from '~/styles/modules/landing/FAQ.module.css';

const QUESTIONS = [
  {
    q: "Does Trovarcis Reach work offline?",
    a: "Yes. All campaign preparation works completely offline. Contacts, templates, email composition, SMTP configuration. You only need internet when you actually hit send.",
  },
  {
    q: "What SMTP providers does it support?",
    a: "Any standard SMTP server, plus Resend API and Amazon SES API at launch. Mailgun, SendGrid, and Postmark support coming in future updates. If it speaks SMTP, Reach works with it.",
  },
  {
    q: "Is my data stored on your servers?",
    a: "No. All contacts, campaigns, templates, and SMTP credentials are stored locally on your device in a SQLite database. We never see your data. Nothing is uploaded, nothing is tracked.",
  },
  {
    q: "What are Credits?",
    a: "Credits power the AI features like email scoring and bounce analysis. 1 Credit equals $0.01. Buy them when you need them. They never expire. Core features like sending, contacts, and templates work without Credits.",
  },
  {
    q: "Can I use Reach on multiple devices?",
    a: "Yes. One license activates on up to 3 devices. Desktop and mobile. You can manage your activated devices in Settings and deactivate one to free up a slot anytime.",
  },
  {
    q: "Is there a money-back guarantee?",
    a: "Yes. 15-day no-questions-asked refund policy. If Reach is not for you, email support@trovarcis.com and we will process your refund.",
  },
  {
    q: "How is Trovarcis Reach different from Mailchimp?",
    a: "Mailchimp charges monthly fees that increase with your list size. Trovarcis Reach is a one-time purchase. Send unlimited emails forever. Plus, your data stays on your device, not on their servers. No tracking pixels injected, no link wrapping, no deliverability risk from shared infrastructure.",
  },
  {
    q: "When does Trovarcis Reach launch?",
    a: "June 2026. Join the waitlist to get early bird pricing and be notified the moment it ships.",
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
      <div className={`container ${styles.inner}`}>
        <h2 ref={headingRef} className={`${styles.heading} reveal`}>Frequently asked questions</h2>

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
