// /account/affiliate - an affiliate's link, clicks and sales, earnings, wallet and payouts.
// Affiliates see counts and amounts, never who bought.

import { useState } from 'react';
import { data, Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import {
  getAffiliateForUser, joinAffiliate, affiliateSummary, validateWallet, saveWallet,
  confirmTestPayout, requestWithdrawal,
} from '~/lib/affiliates.server';
import { sendAffiliatePayoutAlert } from '~/utils/email.server';
import { NETWORKS, HOLD_DAYS, rateForSales, nextTier, percent } from '~/utils/affiliateTerms';
import styles from '~/styles/modules/routes/accountSettings.module.css';
import a from '~/styles/modules/routes/accountAffiliate.module.css';

export const meta = () => [
  { title: 'Affiliate | Your account' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export const headers = () => ({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });

export async function loader({ request }) {
  const user = await requireUser(request);
  const affiliate = await getAffiliateForUser(user.id);
  if (!affiliate) return { joined: false };
  const summary = await affiliateSummary(affiliate);
  // Behind the proxy the request may say http://internal-host; links always show the public site.
  const origin = process.env.NODE_ENV === 'production' ? 'https://trovarci.sh' : new URL(request.url).origin;
  return {
    joined: true,
    code: affiliate.code,
    link: `${origin}/r/${affiliate.code}`,
    paused: affiliate.status !== 'active',
    wallet: affiliate.wallet_address
      ? { network: affiliate.wallet_network, address: affiliate.wallet_address, verified: Boolean(affiliate.wallet_verified_at) }
      : null,
    ...summary,
  };
}

const alert = (args) => sendAffiliatePayoutAlert(args).catch((err) => console.error('[affiliates] alert failed', err.message));

export async function action({ request }) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get('intent') || '');

  if (intent === 'join') {
    if (form.get('agree') !== 'yes') return data({ errors: { agree: 'Read and accept the terms to join.' } }, { status: 400 });
    await joinAffiliate(user);
    return { ok: 'joined' };
  }

  const affiliate = await getAffiliateForUser(user.id);
  if (!affiliate) return data({ errors: { _form: 'Join the program first.' } }, { status: 400 });

  if (intent === 'wallet') {
    const network = String(form.get('network') || '');
    const checked = validateWallet(network, form.get('address'));
    if (!checked.ok) return data({ errors: { address: checked.error } }, { status: 400 });
    const result = await saveWallet(affiliate, network, checked.value);
    if (result.changed) alert({ kind: 'test' });
    return { ok: result.changed ? 'wallet' : 'wallet-same' };
  }

  if (intent === 'confirm-test') {
    const result = await confirmTestPayout(affiliate, String(form.get('payoutId') || ''));
    if (!result.ok) return data({ errors: { _form: 'That test payment could not be confirmed. Reload the page and try again.' } }, { status: 409 });
    return { ok: 'verified' };
  }

  if (intent === 'withdraw') {
    const result = await requestWithdrawal(affiliate);
    if (!result.ok) return data({ errors: { _form: result.error } }, { status: 409 });
    alert({ kind: 'withdrawal', amountUsd: (result.amountCents / 100).toFixed(2) });
    return { ok: 'withdraw' };
  }

  return data({ errors: { _form: 'Unknown request.' } }, { status: 400 });
}

const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const date = (iso) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
const short = (addr) => (addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr);
const explorer = (network, hash) => (network === 'trc20'
  ? `https://tronscan.org/#/transaction/${hash.replace(/^0x/, '')}`
  : `https://etherscan.io/tx/${hash.startsWith('0x') ? hash : `0x${hash}`}`);

const OK_TEXT = {
  joined: 'You are in. Your link is below.',
  wallet: 'Wallet saved. We will send $1 USDT to it as a test; confirm here when it arrives.',
  'wallet-same': 'That wallet is already saved.',
  verified: 'Wallet confirmed. Your payouts go there from now on.',
  withdraw: 'Withdrawal requested. You will see it here when it is sent.',
};

function CopyLink({ link }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select it instead */ }
  };
  return (
    <div className={a.linkRow}>
      <input className={`${styles.input} ${styles.mono}`} value={link} readOnly aria-label="Your affiliate link" onFocus={(e) => e.target.select()} />
      <button type="button" className={styles.btnPrimary} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  );
}

function commissionState(c) {
  if (c.status === 'void') return ['Refunded', styles.pillNeutral];
  if (c.status === 'paid') return ['Paid', styles.pillSuccess];
  if (c.payout_id) return ['On its way', styles.pillAccent];
  if (new Date(c.available_at) > new Date()) return [`Ready ${date(c.available_at)}`, styles.pillWarning];
  return ['Ready', styles.pillSuccess];
}

const PAYOUT_STATE = {
  requested: ['Waiting to be sent', styles.pillWarning],
  sent: ['Sent', styles.pillSuccess],
  confirmed: ['Received', styles.pillSuccess],
  failed: ['Did not go through', styles.pillNeutral],
  cancelled: ['Cancelled', styles.pillNeutral],
};

function Join({ errors }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Earn with Trovarcis Sender</h2>
        <p className={styles.sectionSub}>Share your link. When someone buys Sender through it, you earn a share of the sale, paid in USDT.</p>
      </header>
      <div className={styles.card}>
        <ul className={a.points}>
          <li><strong>30%</strong> of every sale, <strong>35%</strong> after 10 sales, <strong>40%</strong> after 50.</li>
          <li>Your link counts for <strong>90 days</strong> after someone clicks it.</li>
          <li>Withdraw <strong>{HOLD_DAYS} days</strong> after each sale, any amount, in USDT on Tron or Ethereum. We pay the fee.</li>
        </ul>
        <Form method="post" className={a.joinForm}>
          <input type="hidden" name="intent" value="join" />
          <label className={a.agree}>
            <input type="checkbox" name="agree" value="yes" />
            <span>I have read and accept the <Link to="/affiliates#terms">affiliate terms</Link>.</span>
          </label>
          {errors?.agree && <p className={styles.fieldError} role="alert">{errors.agree}</p>}
          <div className={styles.cardActions}>
            <button type="submit" className={styles.btnPrimary}>Join and get my link</button>
          </div>
        </Form>
      </div>
    </section>
  );
}

function Wallet({ wallet, payouts, errors, busy }) {
  const [network, setNetwork] = useState(wallet?.network || 'trc20');
  const test = payouts.find((p) => p.kind === 'test' && wallet && p.network === wallet.network && p.address === wallet.address && ['requested', 'sent', 'failed'].includes(p.status));

  let status = null;
  if (wallet?.verified) status = <p className={a.walletOk}>Confirmed. Payouts go to this wallet.</p>;
  else if (test?.status === 'requested') status = <p className={a.walletWait}>We are sending $1 USDT to this wallet as a test. You will be able to confirm it here once it is sent.</p>;
  else if (test?.status === 'sent') {
    status = (
      <Form method="post" className={a.walletConfirm}>
        <input type="hidden" name="intent" value="confirm-test" />
        <input type="hidden" name="payoutId" value={test.id} />
        <p className={a.walletWait}>We sent $1 USDT on {date(test.sent_at)}. Check your wallet, then confirm.</p>
        <button type="submit" className={styles.btnPrimary} disabled={busy}>It arrived</button>
      </Form>
    );
  } else if (test?.status === 'failed') status = <p className={styles.fieldError}>The $1 test did not go through. Check the address and save it again.</p>;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Wallet</h2>
        <p className={styles.sectionSub}>Every new or changed wallet gets a $1 USDT test payment first, so a typo never costs you a payout.</p>
      </header>
      <div className={styles.card}>
        {wallet && (
          <dl className={styles.kvList}>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>{NETWORKS[wallet.network]?.label}</dt>
              <dd className={`${styles.kvValue} ${styles.mono} ${styles.idValue}`}>{wallet.address}</dd>
            </div>
          </dl>
        )}
        {status}
        <Form method="post" className={a.walletForm}>
          <input type="hidden" name="intent" value="wallet" />
          <fieldset className={a.networks}>
            <legend className={styles.fieldLabel}>Network</legend>
            {Object.entries(NETWORKS).map(([id, n]) => (
              <label key={id} className={`${a.network} ${network === id ? a.networkOn : ''}`}>
                <input type="radio" name="network" value={id} checked={network === id} onChange={() => setNetwork(id)} />
                {n.label}
              </label>
            ))}
          </fieldset>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="address">{wallet ? 'Change wallet address' : 'Wallet address'}</label>
            <input id="address" name="address" className={`${styles.input} ${styles.mono}`} placeholder={NETWORKS[network].example} spellCheck={false} autoComplete="off" />
            {errors?.address && <p className={styles.fieldError} role="alert">{errors.address}</p>}
            <p className={styles.fieldHint}>Copy it from your wallet; never type it. Only USDT on the network chosen above.</p>
          </div>
          <div className={styles.cardActions}>
            <button type="submit" className={styles.btnGhost} disabled={busy}>Save wallet</button>
          </div>
        </Form>
      </div>
    </section>
  );
}

export default function AccountAffiliate() {
  const d = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const errors = result?.errors;

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.head}>
            <p className={styles.eyebrow}>Account</p>
            <h1 className={styles.title}>Affiliate</h1>
            <p className={styles.subtitle}><Link to="/affiliates">How the program works</Link></p>
          </header>

          {result?.ok && <p className={styles.alertSuccess} role="status">{OK_TEXT[result.ok]}</p>}
          {errors?._form && <p className={styles.alertError} role="alert">{errors._form}</p>}

          {!d.joined ? <Join errors={errors} /> : (
            <>
              {d.paused && <p className={styles.alertError}>Your link is paused. Write to support@trovarcis.com.</p>}

              <section className={styles.section}>
                <header className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Your link</h2>
                  <p className={styles.sectionSub}>
                    To send people to a post instead of the Sender page, add <span className={styles.mono}>?to=</span> and the page, like <span className={styles.mono}>/r/{d.code}?to=/blog/email-all-church-members</span>.
                  </p>
                </header>
                <div className={styles.card}><CopyLink link={d.link} /></div>
              </section>

              <section className={styles.section}>
                <div className={a.tiles}>
                  <div className={a.tile}><span className={a.tileLabel}>Clicks, 30 days</span><span className={a.tileValue}>{d.clicks.last_30}</span><span className={a.tileNote}>{d.clicks.all_time} all time</span></div>
                  <div className={a.tile}><span className={a.tileLabel}>Sales</span><span className={a.tileValue}>{d.money.sales}</span><span className={a.tileNote}>not counting refunds</span></div>
                  <div className={a.tile}>
                    <span className={a.tileLabel}>Your rate</span>
                    <span className={a.tileValue}>{percent(rateForSales(d.money.sales))}</span>
                    <span className={a.tileNote}>
                      {nextTier(d.money.sales)
                        ? `${nextTier(d.money.sales).from - d.money.sales} more ${nextTier(d.money.sales).from - d.money.sales === 1 ? 'sale' : 'sales'} to ${percent(nextTier(d.money.sales).rateBp)}`
                        : 'The top rate'}
                    </span>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <header className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Earnings</h2>
                  <p className={styles.sectionSub}>Each sale can be withdrawn {HOLD_DAYS} days after it is made, once the refund window has passed.</p>
                </header>
                <div className={styles.card}>
                  <dl className={styles.kvList}>
                    <div className={styles.kvRow}><dt className={styles.kvLabel}>Ready to withdraw</dt><dd className={`${styles.kvValue} ${a.money}`}>{usd(d.money.available)}</dd></div>
                    <div className={styles.kvRow}><dt className={styles.kvLabel}>Waiting {HOLD_DAYS} days</dt><dd className={`${styles.kvValue} ${a.money}`}>{usd(d.money.waiting)}{d.money.next_available_at ? <span className={styles.muted}>, next ready {date(d.money.next_available_at)}</span> : null}</dd></div>
                    <div className={styles.kvRow}><dt className={styles.kvLabel}>On its way</dt><dd className={`${styles.kvValue} ${a.money}`}>{usd(d.money.requested)}</dd></div>
                    <div className={styles.kvRow}><dt className={styles.kvLabel}>Paid to you</dt><dd className={`${styles.kvValue} ${a.money}`}>{usd(d.money.paid)}</dd></div>
                  </dl>
                  <Form method="post" className={styles.cardActions}>
                    <input type="hidden" name="intent" value="withdraw" />
                    <button type="submit" className={styles.btnPrimary} disabled={busy || d.money.available <= 0 || !d.wallet?.verified}>
                      Withdraw {usd(d.money.available)}
                    </button>
                    {!d.wallet?.verified && <span className={styles.fieldHint}>Add and confirm a wallet below first.</span>}
                  </Form>
                </div>
              </section>

              <Wallet key={d.wallet ? `${d.wallet.network}-${d.wallet.address}` : 'none'} wallet={d.wallet} payouts={d.payouts} errors={errors} busy={busy} />

              {d.commissions.length > 0 && (
                <section className={styles.section}>
                  <header className={styles.sectionHead}><h2 className={styles.sectionTitle}>Sales</h2></header>
                  <div className={styles.card}>
                    <ul className={a.rows}>
                      {d.commissions.map((c, i) => {
                        const [label, pill] = commissionState(c);
                        return (
                          <li key={i} className={a.row}>
                            <span>{date(c.created_at)}</span>
                            <span className={styles.muted}>{usd(c.sale_cents)} sale at {percent(c.rate_bp)}</span>
                            <span className={a.money}>{usd(c.amount_cents)}</span>
                            <span className={`${styles.pill} ${pill}`}>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              )}

              {d.payouts.length > 0 && (
                <section className={styles.section}>
                  <header className={styles.sectionHead}><h2 className={styles.sectionTitle}>Payouts</h2></header>
                  <div className={styles.card}>
                    <ul className={a.rows}>
                      {d.payouts.map((p) => {
                        const [label, pill] = PAYOUT_STATE[p.status];
                        return (
                          <li key={p.id} className={a.row}>
                            <span>{date(p.sent_at || p.requested_at)}</span>
                            <span className={styles.muted}>{p.kind === 'test' ? 'Wallet test' : 'Withdrawal'} to {short(p.address)}</span>
                            <span className={a.money}>{usd(p.amount_cents)}</span>
                            <span className={`${styles.pill} ${pill}`}>
                              {p.tx_hash ? <a href={explorer(p.network, p.tx_hash)} target="_blank" rel="noopener noreferrer">{label}</a> : label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
