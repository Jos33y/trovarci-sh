// /bulk-email-cost-calculator - what a list costs to email on each pricing model, monthly
// and over three years. Works without JavaScript (a GET form), and every result has a URL
// (?contacts=10000&sends=4) that people and AI agents can open directly.

import { useEffect, useMemo, useState } from 'react';
import { Form, Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSeo } from '~/utils/seo';
import { currentSenderPrice } from '~/utils/senderConfig.server';
import { formatSenderPrice, STORAGE_LINE } from '~/utils/senderCopy';
import { calculate, clampInputs, count, money, PRICES_CHECKED, SEND_OPTIONS } from '~/utils/costCalculator';
import styles from '~/styles/modules/routes/calculator.module.css';

const PRESETS = [1000, 5000, 10000, 50000, 100000];
const SEND_LABELS = { 1: 'Monthly', 2: 'Twice', 4: 'Weekly', 8: 'Twice a week', 12: '3 a week' };

const QUESTIONS = [
  [
    'Why does Mailchimp cost more as my list grows?',
    'Mailchimp charges for every contact you keep, whether you email them once a month or not at all. Brevo charges for emails sent, Amazon SES per email, and Trovarcis Sender is one payment.',
  ],
  [
    'What does Trovarcis Sender cost after the first year?',
    'Nothing. It is one payment for the 1.x version, on up to 3 computers, with every 1.x update. You only pay for the email accounts you send through, if they cost anything.',
  ],
  [
    'Do I need Amazon SES to use Sender?',
    'No. Sender sends through any email account with SMTP settings: Gmail, Google Workspace, Zoho, your own server or a sending service like Amazon SES. SES suits big lists because it is cheap per email and has high daily limits.',
  ],
  [
    'How accurate are these prices?',
    `They are the published monthly prices in US dollars as of ${PRICES_CHECKED}. Mailchimp prices between its published tiers are estimated and marked with ~. Prices change, so confirm on each company’s own page before you buy.`,
  ],
];

export const meta = () => {
  const tags = getSeo({
    title: 'Bulk email cost calculator (3-year totals)',
    description: 'Enter your list size and how often you send. See what Mailchimp, Brevo, Amazon SES and Trovarcis Sender cost each month and over three years.',
    path: '/bulk-email-cost-calculator',
  });
  tags.push({
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Bulk email cost calculator',
          url: 'https://trovarci.sh/bulk-email-cost-calculator',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          creator: { '@type': 'Organization', name: 'Trovarcis', url: 'https://trovarci.sh' },
        },
        {
          '@type': 'FAQPage',
          mainEntity: QUESTIONS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
        },
      ],
    },
  });
  return tags;
};

export function loader({ request }) {
  const url = new URL(request.url);
  // Without JavaScript, a preset button submits as ?preset=, alongside the typed number.
  const raw = url.searchParams.get('preset') || url.searchParams.get('contacts');
  const { contacts, sends } = clampInputs(raw, url.searchParams.get('sends'));
  const cents = currentSenderPrice().cents;
  return { contacts, sends, senderPrice: cents / 100, priceLabel: formatSenderPrice(cents) };
}

export default function CostCalculator() {
  const initial = useLoaderData();
  const [contactsText, setContactsText] = useState(count(initial.contacts));
  const [sends, setSends] = useState(initial.sends);

  const inputs = clampInputs(contactsText, sends);
  const result = useMemo(
    () => calculate({ ...inputs, senderPrice: initial.senderPrice }),
    [inputs.contacts, inputs.sends, initial.senderPrice],
  );

  // Keep the address in step with the numbers, so a result can be shared.
  useEffect(() => {
    const qs = `?contacts=${inputs.contacts}&sends=${inputs.sends}`;
    if (window.location.search !== qs) window.history.replaceState(window.history.state, '', qs);
  }, [inputs.contacts, inputs.sends]);

  const pick = (n) => (event) => {
    event.preventDefault();
    setContactsText(count(n));
  };

  const mailchimp = result.rows.find((r) => r.id === 'mailchimp');
  const senderSes = result.rows.find((r) => r.id === 'sender-ses');

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <header className={styles.head}>
            <p className={styles.kicker}>Calculator</p>
            <h1 className={styles.headline}>Bulk email cost calculator</h1>
            <p className={styles.sub}>
              Enter your list size and how often you send. See what each way of sending costs a month and over three years.
            </p>
          </header>

          <div className={styles.layout}>
            <Form method="get" className={styles.form} onSubmit={(e) => e.preventDefault()} aria-label="Your sending">
              <div className={styles.field}>
                <label htmlFor="contacts" className={styles.label}>How many contacts?</label>
                <input
                  id="contacts"
                  name="contacts"
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={contactsText}
                  onChange={(e) => setContactsText(e.target.value)}
                  onBlur={() => setContactsText(count(inputs.contacts))}
                />
                <div className={styles.presets}>
                  {PRESETS.map((n) => (
                    <button
                      key={n}
                      type="submit"
                      name="preset"
                      value={n}
                      className={`${styles.preset} ${inputs.contacts === n ? styles.presetOn : ''}`}
                      aria-pressed={inputs.contacts === n}
                      onClick={pick(n)}
                    >
                      {count(n)}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset className={styles.field}>
                <legend className={styles.label}>How often do you email them?</legend>
                <div className={styles.sends}>
                  {SEND_OPTIONS.map((n) => (
                    <label key={n} className={`${styles.send} ${inputs.sends === n ? styles.sendOn : ''}`}>
                      <input
                        type="radio"
                        name="sends"
                        value={n}
                        checked={inputs.sends === n}
                        onChange={() => setSends(n)}
                        className={styles.radio}
                      />
                      <span className={styles.sendName}>{SEND_LABELS[n]}</span>
                      <span className={styles.sendNote}>{n} a month</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="submit" className={styles.calc}>Calculate</button>

              <p className={styles.volume}>
                {count(result.contacts)} contacts &times; {result.sends} = <strong>{count(result.emails)} emails a month</strong>, about {count(result.perDay)} a day.
              </p>
            </Form>

            <section className={styles.results} aria-labelledby="results-title" aria-live="polite">
              <h2 id="results-title" className={styles.resultsTitle}>Over three years</h2>
              {result.savings > 0 && mailchimp.total != null && (
                <p className={styles.lead}>
                  Mailchimp Standard costs {mailchimp.approx ? 'about ' : ''}<strong>{money(mailchimp.total)}</strong>.
                  {' '}Trovarcis Sender with Amazon SES costs <strong>{money(senderSes.total)}</strong>, which is{' '}
                  <strong className={styles.save}>{money(result.savings)} less</strong>.
                </p>
              )}

              <ol className={styles.rows}>
                {result.rows.map((r) => (
                  <li key={r.id} className={`${styles.row} ${r.ours ? styles.rowOurs : ''}`}>
                    <div className={styles.rowHead}>
                      <div className={styles.rowName}>
                        <span className={styles.name}>{r.name}</span>
                        <span className={styles.model}>{r.model}</span>
                      </div>
                      <div className={styles.rowTotal}>
                        {r.total == null ? (
                          <span className={styles.quote}>Quoted</span>
                        ) : (
                          <>
                            <span className={styles.total}>{r.approx ? '~' : ''}{money(r.total)}</span>
                            <span className={styles.per}>
                              {r.oneTime != null
                                ? (r.monthly ? `${money(r.oneTime)} once + ${money(r.monthly)}/mo` : 'once')
                                : `${money(r.monthly)}/mo`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.bar} aria-hidden="true">
                      <span className={styles.barFill} style={{ transform: `scaleX(${r.share})` }} />
                    </div>
                    <p className={styles.note}>{r.note}</p>
                  </li>
                ))}
              </ol>

              <p className={styles.fine}>
                Monthly billing, US dollars, prices as published in {PRICES_CHECKED}. ~ means estimated between Mailchimp&rsquo;s published tiers.
              </p>
            </section>
          </div>

          <section className={styles.extras} aria-label="Before you send">
            <div className={styles.extra}>
              <h2 className={styles.extraTitle}>Sending through your own accounts</h2>
              <p className={styles.extraText}>
                {count(result.perDay)} emails a day is {result.workspaceAccounts === 1 ? 'one Google Workspace account' : `${result.workspaceAccounts} Google Workspace accounts`} at
                2,000 a day each, or one Amazon SES account. Sender spreads the campaign across your accounts and keeps each inside its limit.
              </p>
              <Link to="/blog/send-bulk-email-from-gmail" className={styles.extraLink}>Gmail and Workspace limits</Link>
            </div>
            <div className={styles.extra}>
              <h2 className={styles.extraTitle}>Clean the list first</h2>
              <p className={styles.extraText}>
                Every dead address costs you on every plan. Checking these {count(result.contacts)} addresses once costs {money(result.verifyCost)} with the Email Verifier.
              </p>
              <Link to="/verify" className={styles.extraLink}>Email Verifier</Link>
            </div>
          </section>

          <section className={styles.cta} aria-labelledby="cta-title">
            <div className={styles.ctaText}>
              <h2 id="cta-title" className={styles.ctaTitle}>Pay once. Send from your own computer.</h2>
              <p className={styles.ctaSub}>
                Trovarcis Sender is {initial.priceLabel} once, for 3 computers and every 1.x update. {STORAGE_LINE}
              </p>
            </div>
            <Link to="/sender" className={styles.ctaButton}>Get Sender</Link>
          </section>

          <section className={styles.faq} aria-labelledby="faq-title">
            <h2 id="faq-title" className={styles.faqTitle}>Questions</h2>
            <dl className={styles.faqList}>
              {QUESTIONS.map(([q, a]) => (
                <div key={q} className={styles.faqItem}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.more}>
              The full breakdown, with the leaks on each plan: <Link to="/blog/bulk-email-cost">What bulk email really costs</Link>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
