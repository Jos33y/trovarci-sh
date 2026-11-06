// /bulk-email-cost-calculator - what a list costs to email on each pricing model over three
// years, drawn as every bill you would pay. Subscriptions are 36 bills; Sender is one.
// Works without JavaScript (a GET form), and every result has a URL
// (?contacts=10000&sends=4) that people and AI agents can open directly.

import { useEffect, useMemo, useState } from 'react';
import { Form, Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import PaidStamp from '~/components/calculator/PaidStamp';
import { getSeo } from '~/utils/seo';
import { currentSenderPrice } from '~/utils/senderConfig.server';
import { formatSenderPrice, STORAGE_LINE } from '~/utils/senderCopy';
import { calculate, clampInputs, count, money, MONTHS, PRICES_CHECKED, SEND_OPTIONS } from '~/utils/costCalculator';
import styles from '~/styles/modules/routes/calculator.module.css';

const SEND_LABELS = { 1: 'monthly', 2: 'twice', 4: 'weekly', 8: '2× a week', 12: '3× a week' };

// The slider runs on a log scale, 100 to 1,000,000 contacts, so small lists get room too.
const SLIDER_MAX = 1000;
const toSlider = (c) => Math.round(250 * Math.log10(c / 100));
function fromSlider(pos) {
  const raw = 100 * 10 ** (pos / 250);
  const step = raw < 1000 ? 10 : raw < 10000 ? 100 : raw < 100000 ? 1000 : 10000;
  return Math.round(raw / step) * step;
}
const SCALE = [
  [0, '100'],
  [250, '1k'],
  [500, '10k'],
  [750, '100k'],
  [1000, '1M'],
];

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
  const { contacts, sends } = clampInputs(url.searchParams.get('contacts'), url.searchParams.get('sends'));
  const cents = currentSenderPrice().cents;
  return { contacts, sends, senderPrice: cents / 100, priceLabel: formatSenderPrice(cents) };
}

function billsLabel(r) {
  if (r.oneTime == null) return `${MONTHS} monthly bills`;
  return r.monthly ? 'Paid once, then SES per email' : 'Paid once';
}

// One mark per month; the first month of a Sender row carries the one-time payment.
function BillStrip({ heights, ours }) {
  const W = 10;
  return (
    <svg className={`${styles.strip} ${ours ? styles.stripOurs : ''}`} viewBox={`0 0 ${MONTHS * W} 60`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line className={styles.stripRule} x1="0" x2={MONTHS * W} y1="59.5" y2="59.5" />
      {heights.map((h, i) => (h > 0 ? (
        <rect
          key={i}
          className={i === 0 && ours ? styles.stubFirst : styles.stubMark}
          x={i * W + 1.5}
          width={W - 3}
          y={59 - h * 56}
          height={h * 56}
        />
      ) : (
        <rect key={i} className={styles.stubEmpty} x={i * W + 1.5} width={W - 3} y="57" height="2" />
      )))}
    </svg>
  );
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

  const them = result.rows.find((r) => (r.id === 'mailchimp' || r.id === 'brevo') && r.total != null);
  const us = result.rows.find((r) => r.id === 'sender-ses');
  const keep = them ? them.total - us.total : null;

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <header className={styles.head}>
            <p className={styles.kicker}><span className={styles.kickerRule} aria-hidden="true" />Calculator</p>
            <h1 className={styles.headline}>Bulk email cost calculator</h1>
            <p className={styles.sub}>
              A subscription bills you every month. Trovarcis Sender bills you once. Enter your list and see every bill you&rsquo;d pay over three years.
            </p>
          </header>

          <Form method="get" className={styles.slip} onSubmit={(e) => e.preventDefault()} aria-label="Your sending">
            <div className={styles.slipField}>
              <label htmlFor="contacts" className={styles.label}>Contacts on your list</label>
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
              <div className={styles.slider}>
                <input
                  type="range"
                  min="0"
                  max={SLIDER_MAX}
                  step="1"
                  value={toSlider(inputs.contacts)}
                  onChange={(e) => setContactsText(count(fromSlider(Number(e.target.value))))}
                  className={styles.range}
                  aria-label="Contacts on your list, from 100 to 1,000,000"
                  aria-valuetext={`${count(inputs.contacts)} contacts`}
                />
                <svg className={styles.ticks} viewBox="0 0 400 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  {Array.from({ length: 41 }, (_, i) => (
                    <line key={i} x1={i * 10} x2={i * 10} y1="0" y2={i % 10 === 0 ? 10 : 4} className={i % 10 === 0 ? styles.tickMajor : styles.tick} />
                  ))}
                </svg>
                <div className={styles.scale} aria-hidden="true">
                  {SCALE.map(([pos, label]) => (
                    <span key={label} style={{ left: `${pos / 10}%` }}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            <fieldset className={styles.slipField}>
              <legend className={styles.label}>Emails each contact gets a month</legend>
              <div className={styles.segments}>
                {SEND_OPTIONS.map((n) => (
                  <label key={n} className={`${styles.segment} ${inputs.sends === n ? styles.segmentOn : ''}`}>
                    <input
                      type="radio"
                      name="sends"
                      value={n}
                      checked={inputs.sends === n}
                      onChange={() => setSends(n)}
                      className={styles.radio}
                    />
                    <span className={styles.segNum}>{n}</span>
                    <span className={styles.segWord}>{SEND_LABELS[n]}</span>
                  </label>
                ))}
              </div>
              <button type="submit" className={styles.calc}>Calculate</button>
            </fieldset>

            <p className={styles.volume}>
              <span className={styles.volumeNum}>{count(result.emails)}</span> emails a month, about {count(result.perDay)} a day
            </p>
          </Form>

          {them ? (
            <section className={styles.verdict} aria-labelledby="verdict">
              <h2 id="verdict" className={styles.visuallyHidden}>Three-year totals</h2>
              <div className={styles.side}>
                <span className={styles.sideName}>{them.name}</span>
                <span className={styles.sideAmount}>{them.approx ? '~' : ''}{money(them.total)}</span>
                <span className={styles.sideNote}>{MONTHS} monthly bills of {money(them.monthly)}</span>
              </div>
              <span className={styles.vs} aria-hidden="true">vs</span>
              <div className={`${styles.side} ${styles.sideOurs}`}>
                <span className={styles.sideName}>Trovarcis Sender + Amazon SES</span>
                <span className={styles.sideAmount}>{money(us.total)}</span>
                <span className={styles.sideNote}>{money(us.oneTime)} once, then about {money(us.monthly)} a month</span>
              </div>
              <p className={styles.keep}>
                Over three years you keep <strong>{money(keep)}</strong>
              </p>
            </section>
          ) : (
            <p className={styles.quoted}>At this size, Mailchimp and Brevo quote a price. Amazon SES and Sender are below.</p>
          )}

          <section className={styles.ledger} aria-labelledby="ledger-title">
            <div className={styles.ledgerHead}>
              <h2 id="ledger-title" className={styles.ledgerTitle}>Every bill for three years</h2>
              <p className={styles.ledgerSub}>Each mark is one month. The taller it is, the bigger the bill.</p>
            </div>

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
                          <span className={styles.per}>{billsLabel(r)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {r.heights ? (
                    <BillStrip heights={r.heights} ours={r.ours} />
                  ) : (
                    <div className={styles.stripQuoted}>Price on request</div>
                  )}
                  <p className={styles.note}>{r.note}</p>
                  {r.id === 'sender-own' && (
                    <div className={styles.stampAt}><PaidStamp price={initial.priceLabel} /></div>
                  )}
                </li>
              ))}
            </ol>
            <div className={styles.axis} aria-hidden="true">
              <span>Month 1</span>
              <span>Month 12</span>
              <span>Month 24</span>
              <span>Month 36</span>
            </div>

            <p className={styles.fine}>
              Monthly billing, US dollars, prices as published in {PRICES_CHECKED}. ~ means estimated between Mailchimp&rsquo;s published tiers.
            </p>
          </section>

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
