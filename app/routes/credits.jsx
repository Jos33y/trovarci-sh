import { useState, useMemo, useEffect, useRef } from 'react';
import { Form, useLoaderData, useActionData, useNavigation, useSearchParams } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getOptionalUser } from '~/utils/session.server';
import {
  CRYPTOMUS_ENABLED,
  STRIPE_ENABLED,
  CUSTOM_MIN_CREDITS,
  CUSTOM_MAX_CREDITS,
  CUSTOM_PRICE_PER_CREDIT,
} from '~/utils/paymentsConfig.server';
import styles from '~/styles/modules/routes/credits.module.css';

export { checkoutAction as action } from '~/actions/checkout.server';

export async function loader({ request }) {
  const user = await getOptionalUser(request);
  return {
    user,
    cryptomusEnabled: CRYPTOMUS_ENABLED,
    stripeEnabled:    STRIPE_ENABLED,
    customMin:        CUSTOM_MIN_CREDITS,
    customMax:        CUSTOM_MAX_CREDITS,
    customRate:       CUSTOM_PRICE_PER_CREDIT,
  };
}

export const meta = () => [
  { title: 'Buy Verification Credits | Trovarcis Reach' },
  {
    name: 'description',
    content:
      'Power the Trovarcis Reach toolkit with credits. Email verification, phone lookups, AI scoring. Pay-as-you-go from $5. Flat $0.01 per credit at any volume.',
  },
  { property: 'og:title', content: 'Buy Verification Credits | Trovarcis Reach' },
  { property: 'og:description', content: 'Pay-as-you-go credits for the email deliverability toolkit. Flat $0.01 per credit. No subscription.' },
  { property: 'og:url', content: 'https://trovarci.sh/credits' },
  { property: 'og:type', content: 'website' },
];

export function links() {
  return [{ rel: 'canonical', href: 'https://trovarci.sh/credits' }];
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l5 5L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BitcoinIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M10 7v10M10 7h3.3a2.2 2.2 0 0 1 0 4.5H10M10 11.5h4a2.4 2.4 0 0 1 0 5h-4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 5.5v1.6M11.5 16.9v1.6M13.2 5.5v1.6M13.2 16.9v1.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v1M12 11v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 500,
    price: 5,
    pricePerCredit: '$0.010',
    features: [
      '500 verification credits',
      'Email verify: 2,500 emails (bulk)',
      'Email verify: 500 emails (single)',
      'Phone lookup: 250 numbers',
      '12-month credit expiry',
    ],
    popular: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    credits: 2500,
    price: 25,
    pricePerCredit: '$0.010',
    features: [
      '2,500 verification credits',
      'Email verify: 12,500 emails (bulk)',
      'Email verify: 2,500 emails (single)',
      'Phone lookup: 1,250 numbers',
      '12-month credit expiry',
    ],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 10000,
    price: 100,
    pricePerCredit: '$0.010',
    features: [
      '10,000 verification credits',
      'Email verify: 50,000 emails (bulk)',
      'Email verify: 10,000 emails (single)',
      'Phone lookup: 5,000 numbers',
      '12-month credit expiry',
    ],
    popular: false,
  },
];

const VALID_PKG_IDS = new Set(['starter', 'growth', 'pro', 'custom']);

const CREDIT_COSTS = [
  { action: 'Email verification (single)', amount: '1', unit: 'credit',              free: false, note: 'Syntax + domain + SMTP check' },
  { action: 'Email verification (bulk)',   amount: '1', unit: 'credit per 5 emails', free: false, note: 'Bulk discount: rounds up to nearest 5' },
  { action: 'Phone number lookup',         amount: '2', unit: 'credits',             free: false, note: 'Real carrier + line type' },
  { action: 'Phone verification (bulk)',   amount: '2', unit: 'credits per number',  free: false, note: 'Per number in the list' },
  { action: 'Email Scorer (Arcis)',        amount: '1', unit: 'credit',              free: false, note: 'AI analysis per email content check' },
  { action: 'DNS Generator',               free: true,  note: 'Client-side, no API cost' },
  { action: 'Domain Health Checker',       free: true,  note: 'DNS lookups, no credit needed' },
  { action: 'SMTP Tester',                 free: true,  note: 'Tests your own SMTP connection' },
];

const FAQ_ITEMS_BASE = [
  {
    q: 'Do credits expire?',
    a: 'Yes. 12 months from purchase. You will get email reminders before expiry so nothing slips away unused.',
  },
  // Payment-method FAQ entry slotted in dynamically based on Stripe flag.
  {
    q: 'What happens if a verification fails?',
    a: 'Credits are only deducted on successful API calls. If a request errors out on our end, no credit is consumed.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Free tools (Domain Checker, DNS Generator, SMTP Tester) require no credits. New accounts also get 10 free credits to try the paid tools.',
  },
  {
    q: 'Do I need an account to see prices?',
    a: 'No. Browse packages, see costs, and read the FAQ without signing up. Account creation is required only at checkout, where you can sign in or create a new account in one step.',
  },
  {
    q: "What's your refund policy?",
    a: '15-day money-back guarantee on unused credits. Email support@trovarci.sh and we will process a full refund.',
  },
];

function buildPaymentFaq(stripeEnabled) {
  return stripeEnabled
    ? {
        q: 'What payment methods do you accept?',
        a: 'Card payments via Stripe and crypto via Cryptomus. Stripe accepts all major cards. Cryptomus accepts Bitcoin, USDT, USDC, Ethereum, Litecoin, and other major cryptocurrencies.',
      }
    : {
        q: 'Can I use crypto to pay?',
        a: 'Yes. We accept Bitcoin, USDT, USDC, Ethereum, Litecoin, and other major cryptocurrencies via Cryptomus. Card payments via Stripe are coming.',
      };
}

export default function CreditsPage() {
  const { user, cryptomusEnabled, stripeEnabled, customMin, customMax, customRate } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const formError = actionData?.errors?._form;
  const customAmountError = actionData?.errors?.creditsAmount;
  const isSubmitting = navigation.state !== 'idle' && navigation.formData != null;

  // Read ?pkg=<id> from URL. Falls back to 'growth' when missing or invalid.
  const initialPkg = (() => {
    const fromQuery = searchParams.get('pkg');
    return fromQuery && VALID_PKG_IDS.has(fromQuery) ? fromQuery : 'growth';
  })();

  const defaultGateway = cryptomusEnabled ? 'crypto' : (stripeEnabled ? 'card' : 'crypto');

  const [paymentMethod, setPaymentMethod] = useState(defaultGateway);
  const [selected, setSelected] = useState(initialPkg);
  const [customCredits, setCustomCredits] = useState('');
  const [openFaq, setOpenFaq] = useState(null);

  const packagesRef = useRef(null);

  // On mount: if a preselect arrived via ?pkg=, smooth-scroll to the cards
  // so the user lands on what they picked from home.
  useEffect(() => {
    const fromQuery = searchParams.get('pkg');
    if (fromQuery && VALID_PKG_IDS.has(fromQuery) && packagesRef.current) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const offsetTop = packagesRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: offsetTop, behavior: reduced ? 'auto' : 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const FAQ_ITEMS = useMemo(() => {
    const items = [...FAQ_ITEMS_BASE];
    items.splice(1, 0, buildPaymentFaq(stripeEnabled));
    return items;
  }, [stripeEnabled]);

  const selectedPackage = useMemo(() => {
    if (selected === 'custom') {
      const parsed = parseInt(customCredits, 10);
      if (!Number.isFinite(parsed) || parsed < customMin || parsed > customMax) {
        return null;
      }
      const priceCents = Math.ceil(parsed * customRate * 100);
      return {
        id: 'custom',
        name: 'Custom',
        credits: parsed,
        price: (priceCents / 100).toFixed(2),
      };
    }
    const pkg = PACKAGES.find((p) => p.id === selected);
    return pkg
      ? { id: pkg.id, name: pkg.name, credits: pkg.credits, price: pkg.price.toString() }
      : null;
  }, [selected, customCredits, customMin, customMax, customRate]);

  const gatewayKey = paymentMethod === 'crypto' ? 'cryptomus' : 'stripe';
  const gatewayName = paymentMethod === 'crypto' ? 'Cryptomus' : 'Stripe';

  function toggleFaq(i) {
    setOpenFaq(openFaq === i ? null : i);
  }

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroRadial} aria-hidden="true" />
          <div className={styles.heroNoise} aria-hidden="true" />
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.kickerRow}>
              <span className="signal-dot signal-dot--sm" aria-hidden="true" />
              <span className={styles.kicker}>Pay as you go</span>
            </div>
            <h1 className={styles.headline}>Buy credits.</h1>
            <p className={styles.sub}>
              Credits power the paid tools: email verification, AI scoring, and phone lookups.
              Flat $0.01 per credit at any volume. No subscription.
            </p>
          </div>
        </section>

        {/* Balance / Auth banner */}
        <section className={styles.balanceSection}>
          <div className="container">
            <div className={styles.balanceBanner}>
              <InfoIcon size={16} />
              {user ? (
                <span>
                  Signed in as <strong>{user.email}</strong>. Current balance:{' '}
                  <strong>{user.creditsBalance.toLocaleString()} credits</strong>.
                </span>
              ) : (
                <span>
                  Browsing as guest. <a href="/signup">Create an account</a> to claim 10 welcome credits, or pick a package below and sign in at checkout.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Payment method toggle + packages */}
        <section ref={packagesRef} className={styles.packagesSection}>
          <div className="container">

            <div className={styles.paymentToggle}>
              <button
                type="button"
                className={paymentMethod === 'crypto' ? styles.toggleActive : styles.toggleBtn}
                onClick={() => setPaymentMethod('crypto')}
                disabled={!cryptomusEnabled}
              >
                <BitcoinIcon size={16} />
                Crypto (Cryptomus)
              </button>
              <button
                type="button"
                className={paymentMethod === 'card' ? styles.toggleActive : styles.toggleBtn}
                onClick={() => stripeEnabled && setPaymentMethod('card')}
                disabled={!stripeEnabled}
                title={!stripeEnabled ? 'Card payments coming soon' : undefined}
              >
                <CardIcon size={16} />
                Card (Stripe)
                {!stripeEnabled && <span className={styles.toggleSoonBadge}>Coming soon</span>}
              </button>
            </div>

            {/* Package cards */}
            <div className={styles.packagesGrid}>
              {PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  className={[
                    styles.packageCard,
                    selected === pkg.id ? styles.packageSelected : '',
                    pkg.popular ? styles.packagePopular : '',
                  ].join(' ')}
                  onClick={() => setSelected(pkg.id)}
                  aria-pressed={selected === pkg.id}
                >
                  {pkg.popular && (
                    <div className={styles.popularBadge}>
                      <span className="signal-dot signal-dot--sm" aria-hidden="true" />
                      Most popular
                    </div>
                  )}
                  <div className={styles.pkgName}>{pkg.name}</div>
                  <div className={styles.pkgCredits}>
                    {pkg.credits.toLocaleString()}
                    <span className={styles.pkgCreditsLabel}> credits</span>
                  </div>
                  <div className={styles.pkgPrice}>
                    ${pkg.price}
                    <span className={styles.pkgPriceUnit}> USD</span>
                  </div>
                  <div className={styles.pkgPerCredit}>{pkg.pricePerCredit} per credit</div>
                  <ul className={styles.pkgFeatures}>
                    {pkg.features.map((f) => (
                      <li key={f} className={styles.pkgFeature}>
                        <span className={styles.pkgCheck}><CheckIcon /></span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}

              {/* Custom amount card */}
              <button
                type="button"
                className={[
                  styles.packageCard,
                  selected === 'custom' ? styles.packageSelected : '',
                ].join(' ')}
                onClick={() => setSelected('custom')}
                aria-pressed={selected === 'custom'}
              >
                <div className={styles.pkgName}>Custom</div>
                <div className={styles.pkgCredits}>
                  <input
                    type="number"
                    min={customMin}
                    max={customMax}
                    step="1"
                    inputMode="numeric"
                    value={customCredits}
                    onChange={(e) => {
                      setCustomCredits(e.target.value);
                      setSelected('custom');
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={customMin.toLocaleString()}
                    aria-label="Custom credit amount"
                    className={styles.customCreditsInput}
                  />
                  <span className={styles.pkgCreditsLabel}> credits</span>
                </div>
                {selected === 'custom' && selectedPackage ? (
                  <div className={styles.pkgPrice}>
                    ${selectedPackage.price}
                    <span className={styles.pkgPriceUnit}> USD</span>
                  </div>
                ) : (
                  <div className={styles.pkgPricePlaceholder}>$-</div>
                )}
                <div className={styles.pkgPerCredit}>
                  ${customRate.toFixed(3)} per credit
                </div>
                <ul className={styles.pkgFeatures}>
                  <li className={styles.pkgFeature}>
                    <span className={styles.pkgCheck}><CheckIcon /></span>
                    Any amount from {customMin.toLocaleString()} to {customMax.toLocaleString()}
                  </li>
                  <li className={styles.pkgFeature}>
                    <span className={styles.pkgCheck}><CheckIcon /></span>
                    12-month credit expiry
                  </li>
                  <li className={styles.pkgFeature}>
                    <span className={styles.pkgCheck}><CheckIcon /></span>
                    Instant delivery
                  </li>
                </ul>
                {customAmountError && selected === 'custom' && (
                  <div className={styles.customError}>
                    {customAmountError}
                  </div>
                )}
              </button>
            </div>

            {/* Checkout form */}
            <Form method="post" className={styles.checkoutRow}>
              <input type="hidden" name="packageKey" value={selected} />
              <input type="hidden" name="gateway" value={gatewayKey} />
              {selected === 'custom' && (
                <input type="hidden" name="creditsAmount" value={customCredits} />
              )}

              <div className={styles.checkoutSummary}>
                <span className={styles.checkoutSelected}>
                  {selectedPackage
                    ? `${selectedPackage.name}: ${selectedPackage.credits.toLocaleString()} credits`
                    : 'Select a package'}
                </span>
                <span className={styles.checkoutPrice}>
                  {selectedPackage ? `$${selectedPackage.price} via ${gatewayName}` : ''}
                </span>
              </div>
              <button
                type="submit"
                className={styles.buyBtn}
                disabled={isSubmitting || !selectedPackage}
              >
                {isSubmitting
                  ? 'Redirecting...'
                  : !user
                  ? 'Sign in to continue'
                  : paymentMethod === 'card'
                  ? 'Pay with card'
                  : 'Pay with crypto'}
              </button>
            </Form>

            {formError && (
              <div role="alert" className={styles.formError}>
                {formError}
              </div>
            )}

            <p className={styles.checkoutNote}>
              {user
                ? `Payments processed by ${gatewayName}. Credits added instantly after confirmation.`
                : `You will be prompted to sign in or create an account at checkout. Payments processed by ${gatewayName}.`}
            </p>
          </div>
        </section>

        {/* Credit costs table */}
        <section className={styles.costsSection}>
          <div className={styles.costsNoise} aria-hidden="true" />
          <div className="container">
            <div className={styles.sectionHeader}>
              <div className={styles.kickerRow}>
                <span className="signal-dot signal-dot--sm" aria-hidden="true" />
                <span className={styles.kicker}>Tool costs</span>
              </div>
              <h2 className={styles.costsTitle}>What each action costs</h2>
            </div>

            <div className={styles.costsTable}>
              <div className={styles.costsHeader}>
                <span>Action</span>
                <span>Credits</span>
                <span>Notes</span>
              </div>
              {CREDIT_COSTS.map(({ action, amount, unit, free, note }) => (
                <div key={action} className={styles.costsRow}>
                  <span className={styles.costsAction}>{action}</span>
                  <span className={styles.costsCost}>
                    {free ? (
                      <span className={styles.costsFree}>Free</span>
                    ) : (
                      <>
                        <span className={styles.costsAmount}>{amount}</span>
                        <span className={styles.costsUnit}>{unit}</span>
                      </>
                    )}
                  </span>
                  <span className={styles.costsNote}>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.faqSection}>
          <div className={styles.faqRadial} aria-hidden="true" />
          <div className="container">
            <div className={styles.sectionHeader}>
              <div className={styles.kickerRow}>
                <span className="signal-dot signal-dot--sm" aria-hidden="true" />
                <span className={styles.kicker}>Answers</span>
              </div>
              <h2 className={styles.faqTitle}>Questions about credits</h2>
            </div>

            <div className={styles.faqList}>
              {FAQ_ITEMS.map(({ q, a }, i) => (
                <div key={i} className={`${styles.faqItem} ${openFaq === i ? styles.faqItemOpen : ''}`}>
                  <button
                    className={styles.faqQuestion}
                    onClick={() => toggleFaq(i)}
                    aria-expanded={openFaq === i}
                  >
                    <span>{q}</span>
                    <span className={[styles.faqChevron, openFaq === i ? styles.faqChevronOpen : ''].join(' ')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  {openFaq === i && (
                    <div className={styles.faqAnswer}>{a}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
