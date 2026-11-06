import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import DnsGenerator from '~/components/tools/DnsGenerator';
import ToolExample from '~/components/tools/ToolExample';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/routes/records.module.css';

// /records - DNS Record Generator. F2.5: sticky strip + bracketless tool host + numbered labels.

export const meta = () => getSeo({
  title: 'Free SPF, DKIM & DMARC Record Generator',
  description: 'Generate copy-paste DNS records for email authentication with lookup counting, SPF mechanism reference, DKIM selector guide, and DMARC tag lookup. Free.',
  path: '/records',
});

const SECTIONS = [
  { id: 'tool', num: '01', name: 'TOOL' },
  { id: 'example', num: '02', name: 'EXAMPLE' },
  { id: 'reference', num: '03', name: 'REFERENCE' },
  { id: 'answers', num: '04', name: 'ANSWERS' },
];

// The example on the page: the records for a made-up domain on Google Workspace.
const EXAMPLE = {
  input: 'northwind-shop.com \u00b7 Google Workspace',
  summary: {
    tone: 'pass',
    title: 'Your records, ready to copy',
    text: 'Add each one in your domain\u2019s DNS settings, often called \u201cDNS\u201d or \u201cManage DNS\u201d where you bought the domain.',
  },
  rows: [
    { tone: 'pass', label: 'Allowed senders (SPF)', value: 'TXT \u00b7 @', code: 'v=spf1 include:_spf.google.com ~all', note: 'Lets Google send email for your domain.' },
    { tone: 'pass', label: 'Email signature (DKIM)', value: 'TXT \u00b7 google._domainkey', code: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0\u2026', note: 'Google creates this key in your Admin console. Paste the one it gives you.' },
    { tone: 'pass', label: 'Fake-email protection (DMARC)', value: 'TXT \u00b7 _dmarc', code: 'v=DMARC1; p=none; rua=mailto:dmarc@northwind-shop.com', note: 'Starts in watch-only mode and sends you reports.' },
    { tone: 'pass', label: 'Where your email arrives (MX)', value: 'MX \u00b7 @', code: 'smtp.google.com  (priority 1)', note: 'Only needed if you\u2019re moving your email to Google.' },
  ],
  cost: 'Free, no signup. Once they\u2019re added, the Domain Checker shows whether they work.',
  meaningsTitle: 'Where each part goes',
  meanings: [
    { tone: 'info', result: 'Type', means: 'The kind of record. These are all TXT, except MX.' },
    { tone: 'info', result: 'Name (or Host)', means: '@ means your domain itself. _dmarc means _dmarc.yourdomain.com.', todo: 'Many DNS panels add your domain for you, so type only the part shown.' },
    { tone: 'info', result: 'Value', means: 'The record itself.', todo: 'Copy it exactly as shown.' },
    { tone: 'warn', result: 'Already have an SPF record?', means: 'A domain can have only one, and two break both.', todo: 'Add the new service to the record you have instead of adding a second.' },
  ],
};

const FAQ_ITEMS = [
  {
    q: "What are SPF, DKIM and DMARC records?",
    a: "Three DNS records that prove your email really comes from you. SPF lists which services may send email for your domain. DKIM signs each email so it can’t be faked or changed on the way. DMARC tells providers what to do with email that fails those checks, and sends you reports.",
  },
  {
    q: "Do I need all three records?",
    a: "Yes. Gmail and Yahoo have required all three from bulk senders since 2024, and Microsoft since 2025. Even if you send a little, missing one makes spam more likely.",
  },
  {
    q: "What DMARC policy should I choose?",
    a: "Start with “none”: nothing is blocked, and the reports show who sends email as your domain. After two to four weeks, once your own email passes, move to “quarantine” (failures go to spam), then “reject” (failures are refused).",
  },
  {
    q: "How long do DNS changes take?",
    a: "Usually under a few hours, sometimes up to 48. Run your domain through the Domain Checker to see when the new records are live.",
  },
  {
    q: "Can I have more than one SPF record?",
    a: "No. A domain can have only one SPF record, and two break both. If you use several email services, list them all in one record. This generator does that when you pick more than one provider.",
  },
  {
    q: "Why does SPF have a 10-lookup limit?",
    a: "SPF stops working once checking it takes more than 10 DNS lookups. Each service you add costs at least one, and some big providers cost several. Go over and receivers treat your SPF as broken (a “PermError”), even though it looks fine in your DNS panel. This generator counts the lookups as you build the record.",
  },
  {
    q: "What is BIMI and do I need it?",
    a: "BIMI shows your logo next to your emails in Gmail, Yahoo and Apple Mail. It only works once DMARC is set to quarantine or reject, and Gmail also needs a paid mark certificate. It’s optional: set up the other three first.",
  },
  {
    q: "What is MTA-STS and who needs it?",
    a: "MTA-STS tells other mail servers to always encrypt the email they deliver to you, so it can’t be read on the way. It needs a small file hosted on a subdomain of yours. It matters most for businesses that handle sensitive information. Start in testing mode for a week, then switch it on.",
  },
  {
    q: "Will this stop my emails going to spam?",
    a: "It fixes the most common cause. Without SPF, DKIM and DMARC, most providers treat your email with suspicion. The rest depends on the list you send to and the email itself: check the email with the Email Scorer and the list with the Email Verifier.",
  },
  {
    q: "What is a DKIM selector?",
    a: "A short name, like google or s1, that tells providers where to find your DKIM key. It’s part of the record’s name: selector._domainkey.yourdomain.com. Each email service uses its own, so several can sign for one domain. Your email provider tells you which one to use.",
  },
  {
    q: "What is SPF alignment and DKIM alignment?",
    a: "DMARC only passes if the domain your email is checked against matches the domain in your From address. For SPF that’s the hidden return address; for DKIM it’s the domain in the signature. Most email services line this up for you once you add their records. “Relaxed” alignment, the default, also accepts subdomains and suits most senders.",
  },
  {
    q: "Should I use ~all or -all in my SPF record?",
    a: "Start with ~all (soft fail): mail from services you haven’t listed is accepted but treated as suspicious, so nothing real is lost while you find every service you use. Move to -all (hard fail) once your DMARC reports show nothing missing, usually after two to four weeks. Never use +all or ?all, which switch SPF’s protection off.",
  },
  {
    q: "How do I stay under the 10-lookup limit with many services?",
    a: "First remove services you no longer use. If you still need too many, split your sending across subdomains, such as news.yourdomain.com for newsletters, each with its own SPF record. “SPF flattening” replaces services with their addresses, but has to be redone whenever a provider changes them. The generator warns you as you get close to 10.",
  },
];

const SPF_MECHANISMS = [
  { mechanism: 'v=spf1', purpose: 'Required version marker at the start of every SPF record', lookups: '0' },
  { mechanism: 'include:', purpose: 'Pull in another domain\'s SPF record (e.g. include:_spf.google.com)', lookups: '1+' },
  { mechanism: 'ip4:', purpose: 'Authorize a specific IPv4 address or CIDR range', lookups: '0' },
  { mechanism: 'ip6:', purpose: 'Authorize a specific IPv6 address or range', lookups: '0' },
  { mechanism: 'a', purpose: 'Authorize the domain\'s A record IPs', lookups: '1' },
  { mechanism: 'mx', purpose: 'Authorize the domain\'s MX record IPs', lookups: '1+' },
  { mechanism: 'exists:', purpose: 'Pass if the given domain resolves to any A record', lookups: '1' },
  { mechanism: 'redirect=', purpose: 'Replace this SPF with another domain\'s policy entirely', lookups: '1' },
  { mechanism: '~all', purpose: 'Soft fail: accept unauthorized senders but mark them', lookups: '0' },
  { mechanism: '-all', purpose: 'Hard fail: reject unauthorized senders (enforcement target)', lookups: '0' },
  { mechanism: '?all', purpose: 'Neutral: provides no protection, avoid', lookups: '0' },
  { mechanism: '+all', purpose: 'Allow any sender, never use', lookups: '0' },
];

const DKIM_SELECTORS = [
  { provider: 'Google Workspace', selector: 'google._domainkey', notes: 'Generated in Google Admin > Apps > Gmail > Authenticate email' },
  { provider: 'Microsoft 365', selector: 'selector1._domainkey, selector2._domainkey', notes: 'Two selectors for key rotation, both must be published' },
  { provider: 'SendGrid', selector: 's1._domainkey, s2._domainkey', notes: 'Domain authentication settings, CNAME records' },
  { provider: 'Mailgun', selector: 'k1._domainkey', notes: 'Sending domain setup, provided as TXT' },
  { provider: 'Postmark', selector: 'pm._domainkey', notes: 'Server API > Sender signatures > Add domain' },
  { provider: 'Zoho Mail', selector: 'zmail._domainkey', notes: 'Email Authentication > DKIM in Zoho admin' },
  { provider: 'Amazon SES', selector: '{token}._domainkey', notes: 'SES generates three CNAMEs; publish all three' },
  { provider: 'Brevo (Sendinblue)', selector: 'mail._domainkey', notes: 'Senders and IP > Domains > Authenticate' },
  { provider: 'Fastmail', selector: 'fm1._domainkey, fm2._domainkey, fm3._domainkey', notes: 'Three CNAMEs for their rotation policy' },
  { provider: 'Resend', selector: 'resend._domainkey', notes: 'Follows Amazon SES pattern under the hood' },
];

const DMARC_TAGS = [
  { tag: 'v', required: 'Yes', purpose: 'Protocol version, always DMARC1', example: 'v=DMARC1' },
  { tag: 'p', required: 'Yes', purpose: 'Policy for the domain: none, quarantine, or reject', example: 'p=quarantine' },
  { tag: 'sp', required: 'No', purpose: 'Policy for subdomains; inherits p= if omitted', example: 'sp=reject' },
  { tag: 'pct', required: 'No', purpose: 'Percentage of mail to apply the policy to (default 100)', example: 'pct=50' },
  { tag: 'rua', required: 'No', purpose: 'Aggregate report address for daily XML digests', example: 'rua=mailto:dmarc@yourdomain.com' },
  { tag: 'ruf', required: 'No', purpose: 'Forensic report address for individual failure samples', example: 'ruf=mailto:forensics@yourdomain.com' },
  { tag: 'adkim', required: 'No', purpose: 'DKIM alignment mode: r (relaxed, default) or s (strict)', example: 'adkim=r' },
  { tag: 'aspf', required: 'No', purpose: 'SPF alignment mode: r (relaxed, default) or s (strict)', example: 'aspf=r' },
  { tag: 'fo', required: 'No', purpose: 'Forensic report options: 0, 1, d, s', example: 'fo=1' },
  { tag: 'ri', required: 'No', purpose: 'Reporting interval in seconds (default 86400)', example: 'ri=86400' },
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

export default function RecordsPage() {
  const toolRef = useReveal();
  const methodRef = useReveal();
  const referenceRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  const [openFaq, setOpenFaq] = useState(null);
  const [activeId, setActiveId] = useState('tool');

  const sectionRefs = {
    tool: useRef(null),
    example: useRef(null),
    reference: useRef(null),
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
    name: 'DNS Record Generator',
    description: 'Generate SPF, DKIM, DMARC, MX, BIMI and MTA-STS records. Free, no account required.',
    url: 'https://trovarci.sh/records',
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
              <DnsGenerator />
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
                Pick who sends your email and you get each record, where it goes and what to paste. Here is an example.
              </p>
            </div>
            <ToolExample {...EXAMPLE} />
          </div>
        </section>

        {/* Reference - SPF mechanisms, DKIM selectors, DMARC tags */}
        <section id="reference" ref={sectionRefs.reference} className={styles.referenceSection}>
          <div className={`container ${styles.container}`}>
            <SectionLabel num="03" name="REFERENCE" />
            <div ref={referenceRef} className={`${styles.referenceHead} reveal`}>
              <h2 className={styles.referenceTitle}>Reference</h2>
              <p className={styles.referenceIntro}>
                The full mechanism, selector, and tag reference for SPF, DKIM, and DMARC. Handy when you need to read someone else's record or hand-tune your own.
              </p>
            </div>

            <div id="spf" className={styles.refBlock}>
              <div className={styles.refBlockHead}>
                <h3 className={styles.refBlockTitle}>SPF mechanisms</h3>
                <p className={styles.refBlockDesc}>
                  Every part of an SPF record and what it costs in DNS lookups. Stay under 10 total or receivers return PermError.
                </p>
              </div>
              <div className={styles.refTableWrap}>
                <table className={styles.refTable}>
                  <thead>
                    <tr>
                      <th className={styles.refColMechanism}>Mechanism</th>
                      <th>Purpose</th>
                      <th className={styles.refColLookups}>Lookups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SPF_MECHANISMS.map((row, i) => (
                      <tr key={i}>
                        <td className={styles.refZoneCell}>{row.mechanism}</td>
                        <td className={styles.refDescCell}>{row.purpose}</td>
                        <td className={styles.refLookupsCell}>{row.lookups}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="dkim" className={styles.refBlock}>
              <div className={styles.refBlockHead}>
                <h3 className={styles.refBlockTitle}>DKIM selectors by provider</h3>
                <p className={styles.refBlockDesc}>
                  Where each major sending service publishes its public key. The generator uses these automatically when you pick a provider.
                </p>
              </div>
              <div className={styles.refTableWrap}>
                <table className={styles.refTable}>
                  <thead>
                    <tr>
                      <th className={styles.refColProvider}>Provider</th>
                      <th className={styles.refColSelector}>Selector path</th>
                      <th>Where to find</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DKIM_SELECTORS.map((row, i) => (
                      <tr key={i}>
                        <td className={styles.refCheckCell}>{row.provider}</td>
                        <td className={styles.refZoneCell}>{row.selector}</td>
                        <td className={styles.refDescCell}>{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="dmarc" className={styles.refBlock}>
              <div className={styles.refBlockHead}>
                <h3 className={styles.refBlockTitle}>DMARC tags</h3>
                <p className={styles.refBlockDesc}>
                  Every tag you can put in a DMARC record. Only v= and p= are required; the rest tune policy and reporting.
                </p>
              </div>
              <div className={styles.refTableWrap}>
                <table className={styles.refTable}>
                  <thead>
                    <tr>
                      <th className={styles.refColTag}>Tag</th>
                      <th className={styles.refColRequired}>Required</th>
                      <th>Purpose</th>
                      <th className={styles.refColExample}>Example</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DMARC_TAGS.map((row, i) => (
                      <tr key={i}>
                        <td className={styles.refZoneCell}>{row.tag}</td>
                        <td className={styles.refCategoryCell}>{row.required}</td>
                        <td className={styles.refDescCell}>{row.purpose}</td>
                        <td className={styles.refZoneCell}>{row.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <h2 className={styles.ctaTitle}>Records set? Check if they work.</h2>
                <p className={styles.ctaDesc}>
                  Verify your SPF, DKIM, and DMARC records are configured and passing authentication.
                </p>
                <div className={styles.ctaActions}>
                  <Link to="/domain" className={styles.ctaPrimary}>Check domain health</Link>
                  <Link to="/score" className={styles.ctaSecondary}>Score your email</Link>
                </div>
              </div>
              <div className={styles.ctaRight} aria-hidden="true">
                <div className={styles.ctaPanelLabel}>NEXT STEPS</div>
                <ul className={styles.ctaSpecList}>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Verify authentication passes</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Test SMTP connection</span>
                  </li>
                  <li className={styles.ctaSpecItem}>
                    <span className={styles.ctaSpecMark} aria-hidden="true" />
                    <span>Score email content</span>
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



