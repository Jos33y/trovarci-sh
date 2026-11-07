// /sender - Trovarcis Sender: what it does, what it needs, and the checkout (card or crypto).

import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import { useState } from 'react';
import ScreenshotViewer from '~/components/sender/ScreenshotViewer';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSeo } from '~/utils/seo';
import { getOptionalUser } from '~/utils/session.server';
import { currentSenderPrice, SENDER_TEST_CENTS } from '~/utils/senderConfig.server';
import { getLatestRelease } from '~/lib/updateFeed.server';
import { senderCheckoutAction, gatewayAvailable } from '~/actions/senderCheckout.server';
import styles from '~/styles/modules/routes/sender.module.css';
import { STORAGE_LINE } from '~/utils/senderCopy';


export const meta = ({ loaderData, data: legacy }) => {
  const data = loaderData || legacy;
  const tags = getSeo({
    title: 'Trovarcis Sender: bulk email from your own computer',
    description: 'Send email campaigns from Windows through your own SMTP account. One payment, 3 computers, every 1.x update. Pay by card or crypto.',
    path: '/sender',
    image: 'https://trovarci.sh/images/sender/sender-og.png',
    imageAlt: 'Trovarcis Sender: the Overview screen with Getting started and daily sending capacity',
  });
  if (data?.price) {
    tags.push({
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Trovarcis Sender',
        operatingSystem: 'Windows 10, Windows 11',
        applicationCategory: 'BusinessApplication',
        url: 'https://trovarci.sh/sender',
        ...(data.release ? { softwareVersion: data.release.version } : {}),
        offers: {
          '@type': 'Offer',
          price: (data.price.cents / 100).toFixed(2),
          priceCurrency: 'USD',
          url: 'https://trovarci.sh/sender#buy',
        },
      },
    });
  }
  return tags;
};

export async function loader({ request }) {
  const user = await getOptionalUser(request);
  const price = currentSenderPrice();
  const release = await getLatestRelease();
  const isAdmin = user?.role === 'admin';
  return {
    signedIn: user ? { email: user.email } : null,
    price,
    testCents: isAdmin ? SENDER_TEST_CENTS : null,
    release,
    gateways: {
      polar: gatewayAvailable('polar', price.key),
      cryptomus: gatewayAvailable('cryptomus', price.key),
      polarTest: isAdmin && gatewayAvailable('polar', 'test'),
    },
  };
}

export const action = senderCheckoutAction;

const usd = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const longDate = (iso) =>
  new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));

const DOES = [
  ['Import a list', 'From a CSV or a paste. Typos, duplicates and broken addresses are set aside before anything sends.'],
  ['Write once, personalize each', 'Merge fields fill in each recipient’s name and details, and you can read every message before it goes.'],
  ['Send through your accounts', 'Gmail, Zoho, Resend, SendGrid, Brevo, Amazon SES or your own server. Pause, resume or cancel at any time.'],
  ['See what happened', 'A report for each campaign: who got it, who did not, and the server’s own reason.'],
];

const NEEDS = [
  'Windows 10 or 11, 64-bit',
  'About 120 MB to download',
  'An SMTP account: Gmail, Google Workspace, Zoho, Resend, SendGrid, Brevo, Mailgun, Postmark, Amazon SES, or your own server',
];

// Who buys Sender, in their own words, each linked to the post written for them.
const FOR = [
  {
    who: 'Newsletter writers',
    job: 'Your newsletter, without the monthly bill',
    text: 'Paste the issue from any email designer and send it to every subscriber through Amazon SES or any account. The price never grows with your list.',
    href: '/blog/send-newsletter-without-mailchimp',
    icon: 'paper',
  },
  {
    who: 'Churches',
    job: 'The weekly bulletin, to every member by name',
    text: 'From the church’s own address, with last week’s bulletin ready to reuse. Nobody sees anyone else’s address.',
    href: '/blog/email-all-church-members',
    icon: 'bell',
  },
  {
    who: 'Schools',
    job: 'Letters to every parent, once each',
    text: 'Each parent gets their own email with their child’s name and the form attached. A family on two class lists gets it once.',
    href: '/blog/email-all-parents-at-once',
    icon: 'book',
  },
  {
    who: 'Recruiters',
    job: 'Openings and interview invites, personal at scale',
    text: 'Name, role and a line written for each candidate, sent only during working hours, from your own address.',
    href: '/blog/email-candidates-in-bulk',
    icon: 'case',
  },
  {
    who: 'Outreach teams',
    job: 'One campaign across many mailboxes',
    text: 'Every Workspace mailbox sends at its own daily limit, and the campaign pauses by itself if servers start refusing.',
    href: '/guides/cold-outreach-setup',
    icon: 'plane',
  },
];

const ICON_PATHS = {
  paper: 'M5 3.5h10l4 4V20.5H5ZM15 3.5v4h4M8.5 11h7M8.5 14h7M8.5 17h4.5',
  bell: 'M12 3v2M7 17V11a5 5 0 0 1 10 0v6M5 17h14M10.5 20a1.5 1.5 0 0 0 3 0',
  book: 'M4 5.5c2.5-1 5-1 8 1 3-2 5.5-2 8-1V19c-2.5-1-5-1-8 1-3-2-5.5-2-8-1ZM12 6.5V20',
  case: 'M3.5 8h17v11h-17ZM9 8V5.5h6V8M3.5 13h17M11 12v2h2v-2',
  plane: 'M3 11.5 21 4l-6.5 16-3.5-6.5ZM11 13.5 21 4',
};

function GroupIcon({ name }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={ICON_PATHS[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 5.5 11 4v7.5H3V5.5ZM12 3.8l9-1.3v9h-9V3.8ZM3 12.5h8V20l-8-1.5v-6ZM12 12.5h9v9l-9-1.3v-7.7Z" fill="currentColor" />
    </svg>
  );
}

function BuyPanel({ signedIn, price, testCents, gateways }) {
  const actionData = useActionData();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formAction === '/sender';
  const errors = actionData?.errors || {};

  const options = [
    gateways.polar && { value: 'polar', label: 'Card', note: 'Visa, Mastercard and more, through Polar' },
    gateways.cryptomus && { value: 'cryptomus', label: 'Crypto', note: 'USDT, BTC, ETH and more, through Cryptomus' },
  ].filter(Boolean);
  const [gateway, setGateway] = useState(options[0]?.value || '');
  const [priceKey, setPriceKey] = useState(price.key);
  const cents = priceKey === 'test' ? testCents : price.cents;
  const testOk = priceKey !== 'test' || gateway === 'cryptomus' || gateways.polarTest;

  return (
    <section className={styles.buy} id="buy" aria-labelledby="buy-title">
      <div className={styles.priceRow}>
        <span className={styles.price}>{usd(price.cents)}</span>
      </div>
      <p className={styles.priceNote}>
        One payment.{' '}
        Lifetime license, 3 computers, every 1.x update. US dollars.
      </p>
      <p className={styles.macOffer}>Buy today, get the Mac version free when it ships.</p>
      <h2 id="buy-title" className={styles.srOnly}>Buy Trovarcis Sender</h2>

      {options.length === 0 ? (
        <p className={styles.formError} role="alert">Checkout is closed for a few minutes. Try again shortly, or write to support@trovarcis.com.</p>
      ) : (
        <Form method="post" className={styles.form} noValidate>
          {signedIn ? (
            <p className={styles.signedIn}>
              Your key goes to <span className={styles.email}>{signedIn.email}</span>
            </p>
          ) : (
            <div className={styles.field}>
              <label htmlFor="buy-email" className={styles.label}>Your email</label>
              <input
                id="buy-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck="false"
                className={styles.input}
                aria-invalid={errors.email ? 'true' : undefined}
                aria-describedby={errors.email ? 'buy-email-error' : 'buy-email-hint'}
                required
                placeholder="Your email"
              />
              {errors.email
                ? <p id="buy-email-error" className={styles.fieldError}>{errors.email}</p>
                : <p id="buy-email-hint" className={styles.hint}>Any email you check, Gmail is fine. Have an account? <Link to="/login?redirectTo=%2Fsender">Sign in</Link> instead.</p>}
            </div>
          )}

          <fieldset className={styles.methods}>
            <legend className={styles.label}>Pay with</legend>
            {options.map((o) => (
              <label key={o.value} className={styles.method} data-checked={gateway === o.value || undefined}>
                <input type="radio" name="gateway" value={o.value} checked={gateway === o.value} onChange={() => setGateway(o.value)} />
                <span className={styles.methodText}>
                  <span className={styles.methodLabel}>{o.label}</span>
                  <span className={styles.methodNote}>{o.note}</span>
                </span>
              </label>
            ))}
            {errors.gateway && <p className={styles.fieldError}>{errors.gateway}</p>}
          </fieldset>

          {testCents && (
            <fieldset className={styles.methods}>
              <legend className={styles.label}>Price (admin only)</legend>
              {[[price.key, `Real price, ${usd(price.cents)}`], ['test', `Test price, ${usd(testCents)}`]].map(([key, text]) => (
                <label key={key} className={styles.method} data-checked={priceKey === key || undefined}>
                  <input type="radio" name="priceKey" value={key} checked={priceKey === key} onChange={() => setPriceKey(key)} />
                  <span className={styles.methodLabel}>{text}</span>
                </label>
              ))}
            </fieldset>
          )}
          {!testCents && <input type="hidden" name="priceKey" value={price.key} />}

          {errors._form && <p className={styles.formError} role="alert">{errors._form}</p>}
          {!testOk && <p className={styles.formError} role="alert">The test price by card needs POLAR_PRODUCT_SENDER_TEST. Use crypto for the test.</p>}

          <button type="submit" className={styles.buyButton} disabled={busy || !gateway || !testOk}>
            {busy ? 'Opening checkout…' : `Buy for ${usd(cents)}`}
          </button>
          <p className={styles.after}>
            Your key appears on the next page as soon as the payment confirms, and comes by email.
            15-day refund if it doesn’t work for you. <Link to="/refund">Refund policy</Link>
          </p>
        </Form>
      )}
    </section>
  );
}

export default function SenderPage() {
  const { signedIn, price, testCents, release, gateways } = useLoaderData();

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <div className={styles.top}>
            <div className={styles.intro}>
              <p className={styles.kicker}>Trovarcis Sender for Windows</p>
              <h1 className={styles.headline}>Send bulk email from your own computer</h1>
              <p className={styles.sub}>
                Sender sends your campaigns through your own SMTP account. One payment, no monthly fee.
              </p>
              <p className={styles.claim}>{STORAGE_LINE}</p>
              <p className={styles.sub}>Mail goes straight from your computer to your own SMTP provider.</p>
            </div>
            <BuyPanel signedIn={signedIn} price={price} testCents={testCents} gateways={gateways} />
          </div>

          <ScreenshotViewer />

          <section className={styles.section} aria-labelledby="for-title">
            <h2 id="for-title" className={styles.sectionTitle}>Who it’s for</h2>
            <p className={styles.para}>Anyone who emails a list they already have, from an address they already own.</p>
            <ul className={styles.forList}>
              {FOR.map((f) => (
                <li key={f.who}>
                  <Link to={f.href} className={styles.forCard}>
                    <span className={styles.forHead}>
                      <span className={styles.forIcon}><GroupIcon name={f.icon} /></span>
                      <span className={styles.forWho}>For {f.who.toLowerCase()}</span>
                    </span>
                    <span className={styles.forJob}>{f.job}</span>
                    <span className={styles.forText}>{f.text}</span>
                    <span className={styles.forMore}>How it works <span aria-hidden="true">→</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="does-title">
            <h2 id="does-title" className={styles.sectionTitle}>What it does</h2>
            <dl className={styles.does}>
              {DOES.map(([title, body]) => (
                <div key={title} className={styles.doesItem}>
                  <dt>{title}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="needs-title">
            <h2 id="needs-title" className={styles.sectionTitle}>What you need</h2>
            <ul className={styles.list}>
              {NEEDS.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </section>

          <section className={styles.download} aria-labelledby="download-title">
            <div>
              <h2 id="download-title" className={styles.sectionTitle}>Already bought it?</h2>
              <p className={styles.para}>
                {release
                  ? `Version ${release.version}${release.releasedAt ? `, released ${longDate(release.releasedAt)}` : ''}. `
                  : ''}
                Your key is on your <Link to="/account/sender">account page</Link> and in your email.
              </p>
              <p className={styles.para}>When installing, if Windows shows a prompt, click <strong>More info</strong>, then <strong>Run anyway</strong>.</p>
            </div>
            <a href="/download/windows" className={styles.downloadButton}>
              <WindowsIcon /> Download for Windows
            </a>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
