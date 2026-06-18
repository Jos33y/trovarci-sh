import { Link, useLoaderData } from 'react-router';
import { TrovarcisReachLogo } from '~/components/shared/Logo';
import { requireUser } from '~/utils/session.server';
import { sql } from '~/utils/db.server';
import styles from '~/styles/modules/routes/receipt.module.css';

export const meta = ({ data }) => [
  { title: data?.receipt
      ? `Receipt ${data.receipt.shortId} | Trovarcis Reach`
      : 'Receipt | Trovarcis Reach' },
  { name: 'robots', content: 'noindex' },
];

/**
 * Loader gates by ownership. Admins can view any receipt (reserved for
 * Section 08 when admin role is used; non-admins cannot see other users'
 * receipts regardless of URL knowledge).
 *
 * For usage transactions this renders as a usage statement rather than a
 * paid receipt - still useful for the user's records.
 */
export async function loader({ request, params }) {
  const user = await requireUser(request);
  const transactionId = params.transactionId;

  const [tx] = await sql`
    SELECT id, user_id, delta, balance_after, type, reference_id, metadata, created_at
    FROM credit_transactions
    WHERE id = ${transactionId}
  `;

  if (!tx) {
    throw new Response('Receipt not found', { status: 404 });
  }

  // Ownership gate. Returns 404 (not 403) on cross-user access so this
  // endpoint cannot be used to enumerate which transaction IDs exist - a
  // 403 would tell an attacker "this UUID is real, just not yours" while
  // a 404 reveals nothing. Admins are allowed through and see the receipt.
  if (tx.user_id !== user.id && user.role !== 'admin') {
    throw new Response('Receipt not found', { status: 404 });
  }

  // If this is a purchase, also pull the payment row for txid and gateway details
  let payment = null;
  if (tx.type === 'purchase' && tx.reference_id) {
    const [p] = await sql`
      SELECT id, gateway, gateway_reference, amount_usd_cents, credits,
             payer_currency, payer_amount, txid, completed_at
      FROM payments
      WHERE id = ${tx.reference_id}
    `;
    payment = p || null;
  }

  // Compact identifier for the UI (first 8 chars of transaction UUID).
  const shortId = tx.id.slice(0, 8).toUpperCase();

  return {
    user: { email: user.email },
    receipt: {
      id: tx.id,
      shortId,
      type: tx.type,
      delta: tx.delta,
      balanceAfter: tx.balance_after,
      metadata: tx.metadata || {},
      createdAt: tx.created_at,
    },
    payment,
  };
}

function formatDateLong(date) {
  return new Date(date).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

function formatDateShort(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export default function ReceiptPage() {
  const { user, receipt, payment } = useLoaderData();

  const isIncoming = receipt.delta > 0;
  const meta = receipt.metadata;

  const docLabel = {
    purchase:   'Payment receipt',
    refund:     'Refund receipt',
    grant:      'Credit grant',
    usage:      'Usage statement',
    adjustment: 'Account adjustment',
  }[receipt.type] || 'Statement';

  const creditsAmount = Math.abs(receipt.delta).toLocaleString();
  const amountUsd = meta.amount_usd ? `$${meta.amount_usd}` : null;

  const descriptionLine = (() => {
    if (receipt.type === 'purchase') {
      return `${meta.package_name || 'Credit package'} - ${creditsAmount} credits`;
    }
    if (receipt.type === 'grant') {
      return meta.source === 'welcome_bonus' ? 'Welcome bonus' : 'Credit grant';
    }
    if (receipt.type === 'refund') {
      return meta.reason ? `Refund: ${meta.reason}` : 'Credit refund';
    }
    if (receipt.type === 'usage') {
      const prettyTool = {
        email_verify:  'Email verification',
        email_score:   'Email Scorer',
        phone_verify:  'Phone number lookup',
        domain_check:  'Domain check',
        smtp_test:     'SMTP test',
        dns_generate:  'DNS Generator',
      }[meta.tool] || meta.tool || 'Service usage';
      return meta.count ? `${prettyTool} (${Number(meta.count).toLocaleString()} units)` : prettyTool;
    }
    return meta.reason || 'Account transaction';
  })();

  return (
    <main className={styles.page}>
      <div className={styles.container}>

        <div className={styles.toolbar}>
          <Link to="/dashboard" className={styles.backLink}>
            &larr; Back to dashboard
          </Link>
          <button
            type="button"
            className={styles.printBtn}
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>

        <div className={styles.receipt}>

          {/* Header */}
          <div className={styles.header}>
            <div className={styles.brand}>
              <TrovarcisReachLogo size={32} />
            </div>
            <div className={styles.docLabel}>
              <div className={styles.docType}>{docLabel}</div>
              <div className={styles.docId}>#{receipt.shortId}</div>
            </div>
          </div>

          {/* From / To */}
          <div className={styles.parties}>
            <div className={styles.partyBlock}>
              <div className={styles.partyLabel}>From</div>
              <div className={styles.partyName}>Trovarcis LLC</div>
              <div className={styles.partyDetail}>Wyoming, USA</div>
              <div className={styles.partyDetail}>support@trovarcis.com</div>
              <div className={styles.partyDetail}>trovarci.sh</div>
            </div>
            <div className={styles.partyBlock}>
              <div className={styles.partyLabel}>To</div>
              <div className={styles.partyName}>{user.email}</div>
              <div className={styles.partyDetail}>Customer</div>
            </div>
          </div>

          {/* Meta */}
          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <div className={styles.metaLabel}>Issued</div>
              <div className={styles.metaValue}>{formatDateLong(receipt.createdAt)}</div>
            </div>
            <div className={styles.metaItem}>
              <div className={styles.metaLabel}>Reference</div>
              <div className={styles.metaValueMono}>{receipt.id}</div>
            </div>
            {payment?.gateway && (
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>Payment method</div>
                <div className={styles.metaValue}>{meta.payment_method || payment.gateway}</div>
              </div>
            )}
          </div>

          {/* Line item */}
          <div className={styles.lineItem}>
            <div className={styles.lineItemHeader}>
              <span className={styles.lineColDesc}>Description</span>
              <span className={styles.lineColCredits}>Credits</span>
              <span className={styles.lineColAmount}>Amount</span>
            </div>
            <div className={styles.lineItemRow}>
              <span className={styles.lineDesc}>{descriptionLine}</span>
              <span className={styles.lineCredits}>
                {isIncoming ? '+' : '-'}{creditsAmount}
              </span>
              <span className={styles.lineAmount}>
                {amountUsd || '-'}
              </span>
            </div>
          </div>

          {/* Totals */}
          {amountUsd && (
            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total paid</span>
                <span className={styles.totalValue}>{amountUsd}</span>
              </div>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Balance after</span>
                <span className={styles.totalValueMuted}>
                  {receipt.balanceAfter.toLocaleString()} credits
                </span>
              </div>
            </div>
          )}

          {/* Blockchain details for crypto payments */}
          {payment?.txid && (
            <div className={styles.bcDetails}>
              <div className={styles.bcHeader}>Blockchain transaction</div>
              <div className={styles.bcRow}>
                <span className={styles.bcLabel}>Network</span>
                <span className={styles.bcValue}>{payment.payer_currency || '-'}</span>
              </div>
              <div className={styles.bcRow}>
                <span className={styles.bcLabel}>Paid in crypto</span>
                <span className={styles.bcValue}>{payment.payer_amount || '-'}</span>
              </div>
              <div className={styles.bcRow}>
                <span className={styles.bcLabel}>Transaction hash</span>
                <span className={styles.bcValueMono}>{payment.txid}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className={styles.footer}>
            <p className={styles.footerNote}>
              Credits never expire. Questions about this {receipt.type === 'usage' ? 'statement' : 'receipt'}? Email support@trovarcis.com and include the reference number above.
            </p>
            <p className={styles.footerFine}>
              Trovarcis LLC &middot; Wyoming, USA &middot; {formatDateShort(receipt.createdAt)}
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
