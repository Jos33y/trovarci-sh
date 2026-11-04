// /sender - Trovarcis Sender: what it does, what it needs, and the checkout (card or crypto).

import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import { useState } from 'react';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSeo } from '~/utils/seo';
import { getOptionalUser } from '~/utils/session.server';
import { currentSenderPrice, SENDER_TEST_CENTS } from '~/utils/senderConfig.server';
import { getLatestRelease } from '~/lib/updateFeed.server';
import { senderCheckoutAction, gatewayAvailable } from '~/actions/senderCheckout.server';
import styles from '~/styles/modules/routes/sender.module.css';

const STORAGE_LINE = 'Your lists and your SMTP credentials are stored locally. Trovarcis never sees them.';

export const meta = ({ loaderData, data: legacy }) => {
  const data = loaderData || legacy;
  const tags = getSeo({
    title: 'Trovarcis Sender: bulk email from your own computer',
    description: 'Send email campaigns from Windows through your own SMTP account. One payment, 3 computers, every 1.x update. Pay by card or crypto.',
    path: '/sender',
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
  'Mac: not yet',
];

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
        {price.listCents > price.cents && <s className={styles.listPrice}>{usd(price.listCents)}</s>}
      </div>
      <p className={styles.priceNote}>
        {price.key === 'launch'
          ? (price.launchEndsAt ? `Launch price until ${longDate(price.launchEndsAt)}.` : 'Launch price for the first buyers.')
          : 'One payment.'}{' '}
        Lifetime license, 3 computers, every 1.x update. US dollars.
      </p>
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
            15-day refund. <Link to="/refund">Refund policy</Link>
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
