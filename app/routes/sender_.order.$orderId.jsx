// /sender/order/:orderId - the buyer's order: waiting, what is missing, or the license key.
// Shown to the account that owns the order, or to the browser that placed it.

import { useEffect, useRef, useState } from 'react';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getOptionalUser } from '~/utils/session.server';
import { getOrderForViewer, paidSoFarCents } from '~/lib/licenseOrders.server';
import { readOrderTokens } from '~/utils/orderAccess.server';
import { senderOrderAction } from '~/actions/senderCheckout.server';
import styles from '~/styles/modules/routes/senderOrder.module.css';

export const meta = () => [
  { title: 'Your Trovarcis Sender order | Trovarcis Reach' },
  { name: 'robots', content: 'noindex, nofollow' },
];

// The key is on this page, so nothing here may be cached or sent on as a referrer.
export const headers = () => ({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });

function stateOf(order, payments, now) {
  if (order.status === 'paid') return 'paid';
  if (order.status === 'refunded') return 'refunded';
  const latest = payments[payments.length - 1];
  if (!latest) return 'failed';
  const lapsed = latest.status === 'open' && latest.expires_at && new Date(latest.expires_at).getTime() < now;
  if (lapsed) return latest.paid_usd_cents > 0 ? 'underpaid' : 'expired';
  if (latest.status === 'creating' || latest.status === 'open') return 'waiting';
  return latest.status; // confirming, partial, paid (settling), underpaid, expired, failed
}

export async function loader({ request, params }) {
  const user = await getOptionalUser(request);
  const view = await getOrderForViewer(params.orderId, { user, tokens: readOrderTokens(request) });
  if (!view) {
    throw new Response('This order is not available here. Sign in with the account that bought it, or open the link in your email.', { status: 404 });
  }
  const { order, payments, license } = view;
  const now = Date.now();
  const latest = payments[payments.length - 1] || null;
  const paidCents = paidSoFarCents(payments);

  return {
    orderId: order.id,
    shortId: order.id.slice(0, 8).toUpperCase(),
    state: stateOf(order, payments, now),
    gateway: order.gateway,
    email: order.email,
    amountCents: order.amount_usd_cents,
    paidCents,
    dueCents: Math.max(0, order.amount_usd_cents - paidCents),
    checkoutUrl: latest && ['open', 'partial', 'confirming'].includes(latest.status) ? latest.checkout_url : null,
    expiresAt: latest?.status === 'open' ? latest.expires_at : null,
    emailSent: Boolean(order.key_email_sent_at),
    emailFailed: Boolean(order.key_email_error) && !order.key_email_sent_at,
    signedIn: Boolean(user),
    license: license && order.status !== 'open'
      ? {
          id: license.id.toUpperCase(),
          key: order.status === 'paid' ? license.license_key : null,
          status: license.status,
          devices: license.live_devices,
          maxDevices: license.max_devices,
        }
      : null,
  };
}

export const action = senderOrderAction;

const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const time = (iso) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));

const POLL_STATES = new Set(['waiting', 'confirming', 'partial', 'paid']);

function CopyKey({ value }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className={styles.secondary} onClick={copy}>
      {copied ? 'Copied' : 'Copy key'}
    </button>
  );
}

function Retry({ intent, label, busy }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Opening…' : label}</button>
    </Form>
  );
}

export default function SenderOrderPage() {
  const d = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state === 'submitting';

  // Crypto can take minutes. Check every 4 seconds while the page is open and nothing is final.
  useEffect(() => {
    if (!POLL_STATES.has(d.state)) return undefined;
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible' && revalidator.state === 'idle') revalidator.revalidate();
    }, 4000);
    return () => clearInterval(iv);
  }, [d.state, revalidator]);

  const crypto = d.gateway === 'cryptomus';
  let body;

  if (d.state === 'paid' && d.license?.key) {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}, paid</p>
        <h1 className={styles.title}>Your Trovarcis Sender license</h1>
        <p className={styles.lead}>Paste this key into Sender when it asks for your license.</p>
        <div className={styles.keyBox}>
          <span className={styles.keyLabel}>License key</span>
          <code className={styles.key}>{d.license.key}</code>
          <span className={styles.keyMeta}>
            License {d.license.id.slice(0, 8)}. {d.license.devices} of {d.license.maxDevices} computers in use.
          </span>
        </div>
        <div className={styles.actions}>
          <a href="/download/windows" className={styles.primary}>Download for Windows</a>
          <CopyKey value={d.license.key} />
        </div>
        <div className={styles.note}>
          <p>Windows will say it protected your PC, because Sender is new and not yet signed with a certificate. Click <strong>More info</strong>, then <strong>Run anyway</strong>. You only do this once.</p>
          <p>If you use Avast or AVG, it may scan the installer for a minute before it opens. That is normal for new software.</p>
        </div>
        <p className={styles.small} role="status">
          {d.emailSent && <>We also sent the key to <span className={styles.email}>{d.email}</span>. </>}
          {d.emailFailed && <>The email with your key did not go out. Copy the key now; it is also on your account page. </>}
          {!d.emailSent && !d.emailFailed && <>The key is on its way to <span className={styles.email}>{d.email}</span>. </>}
          {d.signedIn
            ? <>It is saved on your <Link to="/account/sender">account page</Link>.</>
            : <>It is saved to the Trovarcis account for that email. <Link to="/forgot-password">Set a password</Link> to sign in.</>}
        </p>
      </>
    );
  } else if (d.state === 'refunded') {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}, refunded</p>
        <h1 className={styles.title}>This order was refunded</h1>
        <p className={styles.lead}>Its license {d.license ? d.license.id.slice(0, 8) : ''} no longer works in Sender. Questions? Write to support@trovarcis.com.</p>
      </>
    );
  } else if (d.state === 'partial') {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}</p>
        <h1 className={styles.title}>{usd(d.dueCents)} is still missing</h1>
        <p className={styles.lead}>You sent {usd(d.paidCents)} of {usd(d.amountCents)}. Pay the rest on the same invoice, and your key appears here.</p>
        {d.checkoutUrl && <div className={styles.actions}><a href={d.checkoutUrl} className={styles.primary}>Pay the rest</a></div>}
      </>
    );
  } else if (d.state === 'underpaid') {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}</p>
        <h1 className={styles.title}>{usd(d.dueCents)} is still missing</h1>
        <p className={styles.lead}>
          You sent {usd(d.paidCents)} of {usd(d.amountCents)}, and the invoice closed. Pay what is missing on a new invoice,
          or write to support@trovarcis.com for a refund of what you sent.
        </p>
        <div className={styles.actions}><Retry intent="pay_rest" label={`Pay ${usd(d.dueCents)}`} busy={busy} /></div>
      </>
    );
  } else if (d.state === 'expired') {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}</p>
        <h1 className={styles.title}>{crypto ? 'This invoice expired' : 'This checkout expired'}</h1>
        <p className={styles.lead}>No payment arrived before it closed, so nothing was charged. {crypto ? 'Reopen it to pay.' : 'Open a new checkout to pay.'}</p>
        <div className={styles.actions}><Retry intent={crypto ? 'reopen' : 'retry'} label={crypto ? 'Reopen the invoice' : 'Open a new checkout'} busy={busy} /></div>
      </>
    );
  } else if (d.state === 'failed') {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}</p>
        <h1 className={styles.title}>The payment did not go through</h1>
        <p className={styles.lead}>Nothing was charged. Try again, or <Link to="/sender">start over</Link> with the other payment method.</p>
        <div className={styles.actions}><Retry intent="retry" label="Try again" busy={busy} /></div>
      </>
    );
  } else {
    body = (
      <>
        <p className={styles.kicker}>Order {d.shortId}</p>
        <h1 className={styles.title}>Waiting for your payment to confirm</h1>
        <p className={styles.lead}>
          {d.state === 'confirming' || d.state === 'paid'
            ? (crypto ? 'Your payment is on the network. It confirms in a few minutes, depending on the coin you chose.' : 'Your payment is confirming. This takes a few seconds.')
            : (crypto ? 'Finish paying on the Cryptomus page. Your key appears here as soon as the payment confirms.' : 'Finish paying on the Polar page. Your key appears here as soon as the payment confirms.')}
        </p>
        <dl className={styles.details}>
          <div><dt>Amount</dt><dd>{usd(d.amountCents)}</dd></div>
          <div><dt>Key goes to</dt><dd className={styles.email}>{d.email}</dd></div>
          {d.expiresAt && <div><dt>Invoice open until</dt><dd>{time(d.expiresAt)}</dd></div>}
        </dl>
        {d.checkoutUrl && d.state === 'waiting' && (
          <div className={styles.actions}><a href={d.checkoutUrl} className={styles.primary}>Open the payment page</a></div>
        )}
        <p className={styles.small}>You can close this page. The key also comes by email.</p>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.card} aria-live="polite">
          {body}
          {actionData?.error && <p className={styles.error} role="alert">{actionData.error}</p>}
        </div>
      </main>
      <Footer />
    </div>
  );
}
