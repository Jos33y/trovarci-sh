import { useState } from 'react';
import { Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import DnsGenerator from '~/components/tools/DnsGenerator';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/records.module.css';

export const meta = () => {
  return getSeo({
    title: 'Free SPF, DKIM & DMARC Record Generator',
    description: 'Generate copy-paste DNS records for email authentication. Pick your provider and registrar, get SPF, DKIM, DMARC, MX, BIMI and MTA-STS records with lookup counting and policy guidance.',
    path: '/records',
  });
};

const faqItems = [
  {
    q: 'What are SPF, DKIM, and DMARC records?',
    a: 'SPF (Sender Policy Framework) tells receiving servers which IPs can send email for your domain. DKIM (DomainKeys Identified Mail) adds a digital signature to verify emails were not tampered with in transit. DMARC (Domain-based Message Authentication, Reporting and Conformance) tells servers what to do when SPF or DKIM checks fail.',
  },
  {
    q: 'Do I need all three records?',
    a: 'Yes. SPF alone is not enough. Gmail, Yahoo, and Microsoft all require SPF, DKIM, and DMARC for reliable inbox delivery as of 2024. Missing any one of these significantly increases the chance of your emails going to spam.',
  },
  {
    q: 'What DMARC policy should I choose?',
    a: 'Start with "none" if you are setting up email authentication for the first time. This monitors failures without blocking emails. After 2-4 weeks of monitoring reports, move to "quarantine" (spam folder), then eventually "reject" (block entirely) once you are confident all legitimate email passes authentication.',
  },
  {
    q: 'How long do DNS changes take to propagate?',
    a: 'Most DNS changes propagate within 1-4 hours. Some registrars and ISPs may take up to 48 hours. You can check propagation status using tools like whatsmydns.net or the Trovarcis Reach Domain Health Checker.',
  },
  {
    q: 'Can I have multiple SPF records?',
    a: 'No. You can only have one SPF TXT record per domain. If you use multiple email providers, combine them into a single SPF record using multiple "include:" statements. This generator handles this automatically when you select additional providers.',
  },
  {
    q: 'Why does SPF have a 10-lookup limit?',
    a: 'RFC 7208 caps SPF at 10 DNS lookups to prevent abuse and limit server load. Each include, a, mx, and redirect mechanism counts toward the limit. Large providers like Google and SendGrid each cost 3 lookups on their own, so stacking services quickly adds up. When the limit is exceeded, receivers return a PermError and SPF fails entirely. This generator counts lookups in real time and flags when you are approaching the limit.',
  },
  {
    q: 'What is BIMI and do I need it?',
    a: 'BIMI (Brand Indicators for Message Identification) displays your logo next to messages in supporting inboxes like Gmail, Yahoo, and Apple Mail. It requires DMARC enforcement (p=quarantine or p=reject at pct=100) and typically a Verified Mark Certificate for Gmail coverage. BIMI is optional but useful for brand-led senders; skip it if you are still ramping DMARC.',
  },
  {
    q: 'What is MTA-STS and who should enable it?',
    a: 'MTA-STS (RFC 8461) tells other mail servers to require TLS when delivering mail to you, preventing downgrade attacks. Enabling it requires hosting a small policy file at a dedicated mta-sts subdomain with a valid HTTPS certificate. Enterprises, finance, and healthcare senders benefit most. Start in "testing" mode, review TLS reports for at least a week, then move to "enforce".',
  },
  {
    q: 'Will this fix my emails going to spam?',
    a: 'Proper DNS authentication is the foundation of email deliverability. Without SPF, DKIM, and DMARC, most providers will flag your emails. However, deliverability also depends on content quality, sender reputation, and list hygiene. Use the Trovarcis Reach Email Scorer to check your content.',
  },
];

const recordExplainers = [
  {
    label: 'SPF',
    title: 'SPF tells servers who can send for you',
    icon: SpfIcon,
    text: 'A TXT record that lists every IP address and service authorized to send email on behalf of your domain. If the sending server is not listed, the email fails SPF authentication.',
  },
  {
    label: 'DKIM',
    title: 'DKIM proves emails were not altered',
    icon: DkimIcon,
    text: 'Cryptographic signatures verify that an email was sent by an authorized server and was not modified during transit. Your provider signs messages with a private key; receivers verify with the public key in your DNS.',
  },
  {
    label: 'DMARC',
    title: 'DMARC enforces the rules',
    icon: DmarcIcon,
    text: 'Ties SPF and DKIM together and tells receiving servers what to do when checks fail. Without DMARC, servers make their own decisions. With DMARC, you control the policy.',
  },
];

export default function RecordsPage() {
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
    name: 'DNS Record Generator',
    description: 'Generate SPF, DKIM, and DMARC records for email authentication. Free, no account required.',
    url: 'https://trovarci.sh/records',
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

        {/* Tool IS the hero. No separate hero section. */}
        <section className={styles.toolSection}>
          <div className="container">
            <DnsGenerator />
          </div>
        </section>

        {/* SEO Content */}
        <section className={styles.contentSection}>
          <div className={`container container--narrow`} ref={contentRef}>
            <h2 className={styles.contentTitle}>Why email authentication matters</h2>
            <p className={styles.contentIntro}>
              Every email you send is checked against your domain's DNS records before it reaches the inbox. If your domain lacks proper SPF, DKIM, and DMARC records, major providers like Gmail, Yahoo, and Microsoft will either send your emails to spam or reject them outright.
            </p>
            <p className={styles.contentIntro}>
              As of February 2024, Google and Yahoo enforce strict authentication requirements for bulk senders. Domains sending more than 5,000 emails per day must have all three records configured correctly, with DMARC alignment passing.
            </p>

            <div className={styles.explainerGrid}>
              {recordExplainers.map((item) => (
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
              This generator creates SPF, DKIM, DMARC and MX records for every major email provider, plus optional BIMI and MTA-STS records for brand-led and security-conscious senders. Every record is formatted for your registrar's DNS panel with copy-ready values.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.faqSection}>
          <div className={`container container--narrow`} ref={faqRef}>
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

        {/* CTA - banner card, not centered hero pattern */}
        <section className={styles.ctaSection}>
          <div className="container" ref={ctaRef}>
            <div className={styles.ctaCard}>
              <div className={styles.ctaContent}>
                <h2 className={styles.ctaTitle}>Records set? Check if they work.</h2>
                <p className={styles.ctaDesc}>
                  Verify your SPF, DKIM, and DMARC records are configured and passing authentication.
                </p>
              </div>
              <div className={styles.ctaActions}>
                <Link to="/domain" className={styles.ctaPrimary}>
                  Check Domain Health
                </Link>
                <Link to="/score" className={styles.ctaSecondary}>
                  Score Your Email
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

/* ── Inline SVGs ── */

function ChevronIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpfIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3L4 7V12C4 16.4 7.4 20.5 12 21.5C16.6 20.5 20 16.4 20 12V7L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 12L11 14.5L15.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DkimIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 12L20 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 3H20V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 9L17 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DmarcIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 6H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 10H18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 14H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 18H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}