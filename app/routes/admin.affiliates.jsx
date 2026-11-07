// Admin affiliates - payouts waiting to be sent (wallet tests first), then every affiliate.
// Send the USDT from Cryptomus or a wallet, paste the transaction hash, mark it sent.

import { data, Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { useState } from 'react';
import { requireAdmin } from '~/utils/admin.server';
import { adminOpenPayouts, adminAffiliates, adminRecentPayouts, adminMarkSent, adminMarkFailed } from '~/lib/affiliates.server';
import { NETWORKS } from '~/utils/affiliateTerms';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin';

export const meta = () => [
  { title: 'Affiliates | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const [open, affiliates, recent] = await Promise.all([adminOpenPayouts(), adminAffiliates(), adminRecentPayouts()]);
  return { open, affiliates, recent };
}

export async function action({ request }) {
  const admin = await requireAdmin(request);
  const form = await request.formData();
  const id = String(form.get('payoutId') || '');
  const intent = String(form.get('intent') || '');
  const result = intent === 'sent'
    ? await adminMarkSent(id, { txHash: form.get('txHash'), adminId: admin.id })
    : intent === 'failed'
      ? await adminMarkFailed(id, { note: form.get('note') })
      : { ok: false, error: 'Unknown request.' };
  if (!result.ok) return data({ id, error: result.error }, { status: 400 });
  return { id, done: intent };
}

const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '-');

function CopyAddress({ address }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${styles.formButton} ${styles['formButton--ghost']}`}
      onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* copy by hand */ } }}
    >
      {copied ? 'Copied' : 'Copy address'}
    </button>
  );
}

export default function AdminAffiliates() {
  const { open, affiliates, recent } = useLoaderData();
  const result = useActionData();
  const busy = useNavigation().state !== 'idle';

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Affiliates</h1>
          <p className={styles.pageSubtitle}>Send each payout in USDT on the network shown, then paste the transaction hash.</p>
        </div>
      </header>

      <div className={styles.pageFlow}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Waiting to be sent</h2>
            <span className={styles.panelSub}>wallet tests first: $1, before any real payout to that wallet</span>
          </header>
          {open.length === 0 ? (
            <EmptyState title="Nothing to send" body="Wallet tests and withdrawals appear here when an affiliate asks." />
          ) : (
            <ul className={styles.noteList}>
              {open.map((p) => (
                <li key={p.id} className={styles.noteItem}>
                  <p className={styles.noteText}>
                    <strong>{p.kind === 'test' ? 'Wallet test' : 'Withdrawal'}: {usd(p.amount_cents)} USDT</strong> to {p.email} ({p.code})
                  </p>
                  <p className={styles.noteMeta}>{NETWORKS[p.network]?.label} · asked {day(p.requested_at)}</p>
                  <p className={`${styles.noteText} ${styles.mono}`} style={{ overflowWrap: 'anywhere' }}>{p.address}</p>
                  <div className={styles.filters}>
                    <CopyAddress address={p.address} />
                    <Form method="post" className={styles.filters}>
                      <input type="hidden" name="payoutId" value={p.id} />
                      <input type="hidden" name="intent" value="sent" />
                      <input name="txHash" className={styles.filterInput} placeholder="Transaction hash" aria-label="Transaction hash" spellCheck={false} autoComplete="off" />
                      <button type="submit" className={styles.formButton} disabled={busy}>Mark sent</button>
                    </Form>
                    <Form method="post" className={styles.filters}>
                      <input type="hidden" name="payoutId" value={p.id} />
                      <input type="hidden" name="intent" value="failed" />
                      <input name="note" className={styles.filterInput} placeholder="Why it failed (optional)" aria-label="Why it failed" />
                      <button type="submit" className={`${styles.formButton} ${styles['formButton--ghost']}`} disabled={busy}>Mark failed</button>
                    </Form>
                  </div>
                  {result?.id === p.id && result.error && <p className={styles.noteMeta} role="alert">{result.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Affiliates</h2>
            <span className={styles.panelSub}>{affiliates.length} joined</span>
          </header>
          {affiliates.length === 0 ? (
            <EmptyState title="No affiliates yet" body="People join from their account, at /account/affiliate." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Email</th><th>Code</th><th>Sales</th><th>Earned</th><th>Paid</th><th>Wallet</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {affiliates.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Email">{a.email}</td>
                      <td data-label="Code" className={styles['td--mono']}>{a.code}</td>
                      <td data-label="Sales" className={styles['td--num']}>{a.sales}</td>
                      <td data-label="Earned" className={styles['td--num']}>{usd(a.earned_cents)}</td>
                      <td data-label="Paid" className={styles['td--num']}>{usd(a.paid_cents)}</td>
                      <td data-label="Wallet">
                        {a.wallet_network
                          ? <span className={`${styles.badge} ${a.wallet_verified_at ? styles.badgeSuccess : styles.badgeWarning}`}>{a.wallet_network.toUpperCase()} {a.wallet_verified_at ? 'confirmed' : 'testing'}</span>
                          : <span className={`${styles.badge} ${styles.badgeNeutral}`}>None</span>}
                      </td>
                      <td data-label="Joined" className={styles['td--muted']}>{day(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section className={styles.panel}>
            <header className={styles.panelHead}><h2 className={styles.panelTitle}>Recent payouts</h2></header>
            <ul className={styles.noteList}>
              {recent.map((p) => (
                <li key={p.id} className={styles.noteItem}>
                  <p className={styles.noteText}>{p.kind === 'test' ? 'Wallet test' : 'Withdrawal'} {usd(p.amount_cents)} to {p.email}: {p.status}</p>
                  <p className={`${styles.noteMeta} ${styles.mono}`} style={{ overflowWrap: 'anywhere' }}>{day(p.sent_at || p.requested_at)} · {p.tx_hash || p.note || ''}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
