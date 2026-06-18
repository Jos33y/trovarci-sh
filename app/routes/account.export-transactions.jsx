import { redirect } from 'react-router';
import { requireUser } from '~/utils/session.server';
import { sql } from '~/utils/db.server';

/**
 * POST /account/export-transactions
 *
 * Streams a CSV of the user's last 12 months of credit transactions.
 * Bounded window prevents accidental million-row dumps for accounts that
 * migrate from another system in future.
 */

export async function loader() {
  return redirect('/dashboard');
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const user = await requireUser(request);

  // Pull 12 months of transactions for this user.
  const rows = await sql`
    SELECT
      ct.id,
      ct.created_at,
      ct.type,
      ct.delta,
      ct.balance_after,
      ct.metadata,
      ct.reference_id,
      p.gateway,
      p.txid,
      p.amount_usd_cents
    FROM credit_transactions ct
    LEFT JOIN payments p ON p.id = ct.reference_id
    WHERE ct.user_id = ${user.id}
      AND ct.created_at > now() - interval '12 months'
    ORDER BY ct.created_at DESC
  `;

  const csv = buildCsv(rows);
  const filename = `trovarcis-transactions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// -----------------------------------------------------------------------
// CSV builder
//
// RFC 4180 compliant escaping:
//   - Wrap every field in double quotes
//   - Double up any internal double quotes
//   - \r\n line terminators
//   - Prepend UTF-8 BOM so Excel on Windows recognizes UTF-8
// -----------------------------------------------------------------------

function buildCsv(rows) {
  const headers = [
    'Date',
    'Type',
    'Description',
    'Credits',
    'Balance After',
    'Amount (USD)',
    'Payment Method',
    'Transaction Hash',
    'Reference ID',
  ];

  const lines = [headers.map(quote).join(',')];

  for (const r of rows) {
    const meta = r.metadata || {};
    const description = describeTransaction(r.type, meta);
    const amountUsd = r.amount_usd_cents ? (r.amount_usd_cents / 100).toFixed(2) : '';

    lines.push([
      new Date(r.created_at).toISOString(),
      r.type,
      description,
      String(r.delta),
      String(r.balance_after),
      amountUsd,
      meta.payment_method || r.gateway || '',
      r.txid || '',
      r.id,
    ].map(quote).join(','));
  }

  // Excel UTF-8 BOM + CRLF line endings
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

function quote(value) {
  const s = String(value == null ? '' : value);
  return `"${s.replace(/"/g, '""')}"`;
}

function describeTransaction(type, meta) {
  if (type === 'purchase') {
    return `${meta.package_name || 'Credit purchase'}${meta.custom_credits ? ` (custom)` : ''}`;
  }
  if (type === 'grant') {
    return meta.source === 'welcome_bonus' ? 'Welcome bonus' : 'Credit grant';
  }
  if (type === 'refund') {
    return meta.reason ? `Refund: ${meta.reason}` : 'Credit refund';
  }
  if (type === 'usage') {
    const prettyTool = {
      email_verify:  'Email verification',
      email_score:   'Email Scorer',
      phone_verify:  'Phone number lookup',
      domain_check:  'Domain check',
      smtp_test:     'SMTP test',
      dns_generate:  'DNS Generator',
    }[meta.tool] || meta.tool || 'Service usage';
    return meta.count ? `${prettyTool} (${meta.count} units)` : prettyTool;
  }
  if (type === 'adjustment') {
    return meta.reason || 'Account adjustment';
  }
  return type;
}
