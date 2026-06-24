// Admin user detail - KPI summary, nested tables, credit adjustment form, audit log.
import { useState } from 'react';
import { Link, Form, useLoaderData, useActionData, useNavigation, data, redirect } from 'react-router';
import {
  requireAdmin,
  adminGetUserDetail,
  adminListUserTransactions,
  adminListUserPayments,
  adminListUserJobs,
  adminListActions,
} from '~/utils/admin.server';
import { logAdminAction } from '~/utils/adminActions.server';
import { grantCredits } from '~/lib/credits.server';
import EmptyState from '~/components/admin/EmptyState';
import KPICard from '~/components/admin/KPICard';
import {
  CardIcon, TagIcon, LayersIcon, VerifyIcon, ShieldIcon,
} from '~/components/icons';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = ({ data }) => [
  { title: data?.user ? `${data.user.email} | Admin` : 'User | Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request, params }) {
  await requireAdmin(request);

  if (!UUID_RE.test(params.userId)) {
    throw new Response('Bad request', { status: 400 });
  }

  const user = await adminGetUserDetail(params.userId);
  if (!user) {
    throw new Response('Not Found', { status: 404 });
  }

  const [transactions, payments, jobs, actions] = await Promise.all([
    adminListUserTransactions(params.userId, { limit: 50 }),
    adminListUserPayments(params.userId),
    adminListUserJobs(params.userId),
    adminListActions({ targetUserId: params.userId, limit: 25 }),
  ]);

  return { user, transactions, payments, jobs, actions };
}

export async function action({ request, params }) {
  const admin = await requireAdmin(request);

  if (!UUID_RE.test(params.userId)) {
    return data({ errors: { _form: 'Invalid user id' } }, { status: 400 });
  }
  if (params.userId === admin.id) {
    return data({ errors: { _form: 'You cannot adjust your own credits' } }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const amountRaw = form.get('amount');
  const reason = String(form.get('reason') || '').trim();

  const amount = parseInt(String(amountRaw || ''), 10);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
    return data({ errors: { amount: 'Amount must be a positive integer (1 - 1,000,000)' } }, { status: 400 });
  }
  if (reason.length < 5 || reason.length > 500) {
    return data({ errors: { reason: 'Reason must be 5-500 characters' } }, { status: 400 });
  }

  let creditType;
  let actionType;
  if (intent === 'grant')      { creditType = 'grant';      actionType = 'credit_grant'; }
  else if (intent === 'refund'){ creditType = 'refund';     actionType = 'credit_refund'; }
  else if (intent === 'adjust'){ creditType = 'adjustment'; actionType = 'credit_adjustment'; }
  else {
    return data({ errors: { _form: 'Unknown action' } }, { status: 400 });
  }

  const minuteBucket = Math.floor(Date.now() / 60_000);
  const referenceId = `admin_${creditType}_${admin.id}_${minuteBucket}`;

  await logAdminAction(null, {
    actorId: admin.id,
    actionType,
    targetUserId: params.userId,
    targetKind: 'user',
    reason,
    context: { amount, credit_type: creditType, reference_id: referenceId },
  });

  const result = await grantCredits(params.userId, amount, creditType, {
    referenceId,
    metadata: {
      source: 'admin_action',
      actor_id: admin.id,
      actor_email: admin.email,
      reason,
    },
  });

  return redirect(`/admin/users/${params.userId}?adjusted=${result.idempotent ? 'idempotent' : 'ok'}`);
}

const STATUS_BADGE = {
  confirmed:        'badgeSuccess',
  pending:          'badgeNeutral',
  awaiting_payment: 'badgeWarning',
  failed:           'badgeError',
  expired:          'badgeError',
  refunded:         'badgeNeutral',
  complete:         'badgeSuccess',
  partial:          'badgeWarning',
  processing:       'badgeWarning',
  cancelled:        'badgeNeutral',
};

const TYPE_TONE = {
  purchase:   'badgeSuccess',
  grant:      'badgeAccent',
  usage:      'badgeNeutral',
  refund:     'badgeWarning',
  adjustment: 'badgeNeutral',
  expiry:     'badgeError',
};

function formatCents(c) { return '$' + (c / 100).toFixed(2); }
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export default function AdminUserDetail() {
  const { user, transactions, payments, jobs, actions } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  const [intent, setIntent] = useState('grant');

  return (
    <>
      <Link to="/admin/users" className={styles.backLink}>← Back to users</Link>

      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{user.email}</h1>
          <p className={styles.pageSubtitle}>
            <span className={styles.mono}>{user.id}</span>
          </p>
        </div>
        <div className={styles.pageHeaderActions}>
          {user.role === 'admin' && <span className={`${styles.badge} ${styles.badgeAccent}`}>Admin</span>}
          {user.deleted_at && <span className={`${styles.badge} ${styles.badgeError}`}>Deleted</span>}
          {!user.email_verified_at && <span className={`${styles.badge} ${styles.badgeWarning}`}>Unverified</span>}
          {user.email_verified_at && !user.deleted_at && <span className={`${styles.badge} ${styles.badgeSuccess}`}>Active</span>}
        </div>
      </header>

      <div className={styles.kpiStrip}>
        <KPICard
          label="Current balance"
          value={user.credits_balance.toLocaleString()}
          hint="credits"
          icon={CardIcon}
        />
        <KPICard
          label="Lifetime purchased"
          value={user.lifetime_purchased.toLocaleString()}
          hint={`+${user.lifetime_granted.toLocaleString()} granted`}
          icon={TagIcon}
        />
        <KPICard
          label="Lifetime used"
          value={user.lifetime_used.toLocaleString()}
          hint={`${user.lifetime_refunded.toLocaleString()} refunded`}
          icon={LayersIcon}
        />
        <KPICard
          label="Revenue"
          value={formatCents(user.revenue_usd_cents)}
          hint={`${user.payments_confirmed} confirmed`}
          icon={TagIcon}
          variant="hero"
        />
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          {/* Transactions */}
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Recent transactions</h2>
              <span className={styles.panelSub}>{transactions.length} of {user.total_transactions}</span>
            </header>
            {transactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                body="Credit movements will appear here once this user buys, uses, or is granted credits."
              />
            ) : (
              <table className={styles.table}>
                <colgroup>
                  <col style={{ width: 160 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 100 }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th className={styles['th--right']}>Delta</th>
                    <th className={styles['th--right']}>Balance</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td data-label="When" className={styles['td--mono']}>{formatDate(t.created_at)}</td>
                      <td data-label="Type">
                        <span className={`${styles.badge} ${styles[TYPE_TONE[t.type] || 'badgeNeutral']}`}>{t.type}</span>
                      </td>
                      <td data-label="Delta" className={styles['td--num']} style={{ color: t.delta > 0 ? 'var(--trov-success)' : 'var(--trov-error)' }}>
                        {t.delta > 0 ? '+' : ''}{t.delta.toLocaleString()}
                      </td>
                      <td data-label="Balance" className={styles['td--num']}>{t.balance_after.toLocaleString()}</td>
                      <td data-label="Reference" className={styles.refCell} title={t.reference_id || ''}>
                        {t.reference_id || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Payments */}
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Payments</h2>
              <span className={styles.panelSub}>{payments.length}</span>
            </header>
            {payments.length === 0 ? (
              <EmptyState
                icon={CardIcon}
                title="No payments"
                body="Charges and refunds will appear here once this user pays."
              />
            ) : (
              <table className={styles.table}>
                <colgroup>
                  <col style={{ width: 180 }} />
                  <col style={{ width: 100 }} />
                  <col />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 120 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Gateway</th>
                    <th>Package</th>
                    <th className={styles['th--right']}>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="When" className={styles['td--mono']}>{formatDate(p.created_at)}</td>
                      <td data-label="Gateway">{p.gateway}</td>
                      <td data-label="Package">
                        <Link to={`/admin/payments/${p.id}`} className={styles.rowLink}>{p.package_key || '-'}</Link>
                      </td>
                      <td data-label="Amount" className={styles['td--num']}>{formatCents(p.amount_usd_cents)}</td>
                      <td data-label="Status">
                        <span className={`${styles.badge} ${styles[STATUS_BADGE[p.status] || 'badgeNeutral']}`}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Jobs */}
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Verification jobs</h2>
              <span className={styles.panelSub}>{jobs.length}</span>
            </header>
            {jobs.length === 0 ? (
              <EmptyState
                icon={LayersIcon}
                title="No jobs"
                body="Bulk email or phone verification runs will appear here."
              />
            ) : (
              <table className={styles.table}>
                <colgroup>
                  <col style={{ width: 180 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 120 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th className={styles['th--right']}>Items</th>
                    <th className={styles['th--right']}>Credits</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td data-label="When" className={styles['td--mono']}>{formatDate(j.created_at)}</td>
                      <td data-label="Kind">
                        <Link to={`/admin/jobs/${j.id}`} className={styles.rowLink}>{j.kind}</Link>
                      </td>
                      <td data-label="Items" className={styles['td--num']}>{j.processed_items.toLocaleString()} / {j.total_items.toLocaleString()}</td>
                      <td data-label="Credits" className={styles['td--num']}>{j.credits_charged.toLocaleString()}</td>
                      <td data-label="Status">
                        <span className={`${styles.badge} ${styles[STATUS_BADGE[j.status] || 'badgeNeutral']}`}>{j.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className={styles.detailSide}>
          {/* Action form */}
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Adjust credits</h2>
            </header>

            <Form method="post" className={styles.actionForm}>
              <div className={styles.intentRow}>
                {['grant', 'refund', 'adjust'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setIntent(opt)}
                    className={`${styles.intentBtn} ${intent === opt ? styles.intentBtnActive : ''}`}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
              <input type="hidden" name="intent" value={intent} />

              <div className={styles.formField}>
                <label className={styles.filterLabel} htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  max="1000000"
                  required
                  placeholder="e.g. 100"
                  className={styles.filterInput}
                />
                {actionData?.errors?.amount && <div className={styles.formError}>{actionData.errors.amount}</div>}
              </div>

              <div className={styles.formField}>
                <label className={styles.filterLabel} htmlFor="reason">Reason</label>
                <textarea
                  id="reason"
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  className={styles.formTextarea}
                  placeholder="5-500 chars. Audit logged."
                />
                {actionData?.errors?.reason && <div className={styles.formError}>{actionData.errors.reason}</div>}
              </div>

              {actionData?.errors?._form && <div className={styles.formError}>{actionData.errors._form}</div>}

              <button type="submit" className={styles.formButton} disabled={submitting}>
                {submitting ? 'Submitting...' : `Apply ${intent}`}
              </button>
            </Form>
          </section>

          {/* Recent admin actions */}
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Recent admin actions</h2>
              <span className={styles.panelSub}>{actions.length}</span>
            </header>
            {actions.length === 0 ? (
              <EmptyState
                icon={ShieldIcon}
                title="No admin actions"
                body="Grants, refunds, and other admin operations on this user will appear here."
              />
            ) : (
              <ul className={styles.actionList}>
                {actions.map((a) => (
                  <li key={a.id} className={styles.actionItem}>
                    <div className={styles.actionLine}>
                      <span className={styles.actionType}>{a.action_type}</span>
                      <span className={styles.actionTime}>{formatDate(a.created_at)}</span>
                    </div>
                    <div className={styles.actionMeta}>
                      by {a.actor_email || a.actor_id?.slice(0, 8) || 'system'}
                      {a.reason ? <> · {a.reason.length > 80 ? a.reason.slice(0, 80) + '...' : a.reason}</> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
