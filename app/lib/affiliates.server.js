// Affiliate program: referral codes, the commission each referred Sender sale earns, and USDT
// payouts. Terms live in ~/utils/affiliateTerms.js.
//
// Money rules this file keeps:
// - a commission keeps the rate it was earned at, whatever the terms say later;
// - a commission can be withdrawn HOLD_DAYS after the sale; a refund before it is paid voids it;
// - nobody earns on their own purchase;
// - a real payout only goes to a wallet whose $1 test payout the affiliate confirmed;
// - affiliates see counts and amounts, never who bought.

import crypto from 'node:crypto';
import { sql } from '~/utils/db.server';
import {
  HOLD_DAYS, COOKIE_DAYS, TEST_PAYOUT_CENTS, NETWORKS,
  rateForSales, commissionCents,
} from '~/utils/affiliateTerms';

export const REF_COOKIE = 'trov_ref';

// ---------------------------------------------------------------------------
// Referral cookie
// ---------------------------------------------------------------------------

export function refCookie(code) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${REF_COOKIE}=${code}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}`;
}

export function readRefCode(request) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${REF_COOKIE}=([a-z0-9]{4,24})(?:;|$)`));
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

export async function getActiveAffiliateByCode(code, db = sql) {
  if (!code || !/^[a-z0-9]{4,24}$/.test(code)) return null;
  const [row] = await db`
    SELECT a.*, u.email AS user_email
    FROM affiliates a JOIN users u ON u.id = a.user_id
    WHERE a.code = ${code} AND a.status = 'active' AND u.deleted_at IS NULL
  `;
  return row || null;
}

export async function getAffiliateForUser(userId) {
  const [row] = await sql`SELECT * FROM affiliates WHERE user_id = ${userId}`;
  return row || null;
}

// A readable code from the email's first part, plus digits when that is taken.
function baseCode(email) {
  const local = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return (local.length >= 4 ? local : `${local}trov`).slice(0, 16);
}

export async function joinAffiliate(user) {
  const existing = await getAffiliateForUser(user.id);
  if (existing) return existing;
  const base = baseCode(user.email);
  for (let i = 0; i < 6; i += 1) {
    const code = i === 0 ? base : `${base}${crypto.randomInt(10, 9999)}`;
    const [row] = await sql`
      INSERT INTO affiliates (user_id, code) VALUES (${user.id}, ${code})
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    if (row) return row;
    const again = await getAffiliateForUser(user.id);
    if (again) return again;
  }
  throw new Error('Could not create an affiliate code');
}

// ---------------------------------------------------------------------------
// Checkout and orders
// ---------------------------------------------------------------------------

/** The affiliate to credit for a checkout, or null. Never the buyer themselves. */
export async function affiliateForCheckout(request, { userId, email }) {
  const affiliate = await getActiveAffiliateByCode(readRefCode(request));
  if (!affiliate) return null;
  if (userId && affiliate.user_id === userId) return null;
  if (email && affiliate.user_email.toLowerCase() === String(email).toLowerCase()) return null;
  return affiliate.id;
}

/** Called inside the transaction that marks an order paid. */
export async function recordCommissionInTx(tx, order, buyerUserId) {
  if (!order.affiliate_id) return null;
  const [affiliate] = await tx`SELECT * FROM affiliates WHERE id = ${order.affiliate_id} FOR UPDATE`;
  if (!affiliate || affiliate.user_id === buyerUserId) return null;
  const [{ n }] = await tx`
    SELECT count(*)::int AS n FROM affiliate_commissions
    WHERE affiliate_id = ${affiliate.id} AND status <> 'void'
  `;
  const rateBp = rateForSales(n);
  const amount = commissionCents(order.amount_usd_cents, rateBp);
  if (amount <= 0) return null;
  const [row] = await tx`
    INSERT INTO affiliate_commissions (affiliate_id, order_id, sale_cents, rate_bp, amount_cents, available_at)
    VALUES (${affiliate.id}, ${order.id}, ${order.amount_usd_cents}, ${rateBp}, ${amount},
            now() + make_interval(days => ${HOLD_DAYS}))
    ON CONFLICT (order_id) DO NOTHING
    RETURNING *
  `;
  return row || null;
}

/** Called inside the refund transaction. A commission already paid out stays paid. */
export async function voidCommissionInTx(tx, orderId) {
  const [c] = await tx`
    SELECT id, amount_cents, payout_id FROM affiliate_commissions
    WHERE order_id = ${orderId} AND status = 'pending'
    FOR UPDATE
  `;
  if (!c) return;
  await tx`UPDATE affiliate_commissions SET status = 'void', voided_at = now(), payout_id = NULL WHERE id = ${c.id}`;
  if (!c.payout_id) return;
  // It was part of a withdrawal not yet sent: take it off that request, or cancel the request.
  const [left] = await tx`
    UPDATE affiliate_payouts SET amount_cents = amount_cents - ${c.amount_cents}
    WHERE id = ${c.payout_id} AND status = 'requested' AND amount_cents > ${c.amount_cents}
    RETURNING id
  `;
  if (!left) await tx`UPDATE affiliate_payouts SET status = 'cancelled', note = 'Sale refunded' WHERE id = ${c.payout_id} AND status = 'requested'`;
}

// ---------------------------------------------------------------------------
// The affiliate's own view
// ---------------------------------------------------------------------------

export async function affiliateSummary(affiliate) {
  const [money] = await sql`
    SELECT
      count(*) FILTER (WHERE status <> 'void')::int AS sales,
      COALESCE(sum(amount_cents) FILTER (WHERE status = 'pending' AND payout_id IS NULL AND available_at > now()), 0)::int AS waiting,
      COALESCE(sum(amount_cents) FILTER (WHERE status = 'pending' AND payout_id IS NULL AND available_at <= now()), 0)::int AS available,
      COALESCE(sum(amount_cents) FILTER (WHERE status = 'pending' AND payout_id IS NOT NULL), 0)::int AS requested,
      COALESCE(sum(amount_cents) FILTER (WHERE status = 'paid'), 0)::int AS paid,
      min(available_at) FILTER (WHERE status = 'pending' AND payout_id IS NULL AND available_at > now()) AS next_available_at
    FROM affiliate_commissions WHERE affiliate_id = ${affiliate.id}
  `;
  const [clicks] = await sql`
    SELECT
      count(DISTINCT session_hash)::int AS all_time,
      count(DISTINCT session_hash) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30
    FROM analytics_events
    WHERE event_type = 'affiliate_click' AND metadata->>'code' = ${affiliate.code}
  `;
  const commissions = await sql`
    SELECT created_at, sale_cents, rate_bp, amount_cents, status, available_at, payout_id
    FROM affiliate_commissions WHERE affiliate_id = ${affiliate.id}
    ORDER BY created_at DESC LIMIT 50
  `;
  const payouts = await sql`
    SELECT id, kind, amount_cents, network, address, status, tx_hash, requested_at, sent_at, confirmed_at
    FROM affiliate_payouts WHERE affiliate_id = ${affiliate.id}
    ORDER BY requested_at DESC LIMIT 30
  `;
  return { money, clicks, commissions, payouts };
}

export function validateWallet(network, address) {
  const net = NETWORKS[network];
  const value = String(address || '').trim();
  if (!net) return { ok: false, error: 'Choose USDT on Tron or USDT on Ethereum.' };
  if (!value) return { ok: false, error: 'Paste your wallet address.' };
  if (!net.test.test(value)) {
    return { ok: false, error: network === 'trc20'
      ? 'A Tron address starts with T and is 34 characters long. Check it and paste it again.'
      : 'An Ethereum address starts with 0x and is 42 characters long. Check it and paste it again.' };
  }
  return { ok: true, value };
}

/** Saving a new or changed wallet unverifies it and asks for a $1 test payout. */
export async function saveWallet(affiliate, network, address) {
  return sql.begin(async (tx) => {
    const [a] = await tx`SELECT * FROM affiliates WHERE id = ${affiliate.id} FOR UPDATE`;
    const same = a.wallet_network === network && a.wallet_address === address;
    if (same && a.wallet_verified_at) return { changed: false };
    if (same) {
      // Same wallet, not yet confirmed: keep a test on its way, or start a new one after a failed test.
      const [test] = await tx`
        SELECT id FROM affiliate_payouts
        WHERE affiliate_id = ${a.id} AND kind = 'test' AND status IN ('requested', 'sent')
          AND network = ${network} AND address = ${address}
      `;
      if (test) return { changed: false };
    }
    await tx`
      UPDATE affiliate_payouts SET status = 'cancelled', note = 'Wallet changed'
      WHERE affiliate_id = ${a.id} AND status = 'requested'
    `;
    // A withdrawal waiting on the old wallet goes back to the balance.
    await tx`
      UPDATE affiliate_commissions SET payout_id = NULL
      WHERE affiliate_id = ${a.id} AND status = 'pending'
        AND payout_id IN (SELECT id FROM affiliate_payouts WHERE affiliate_id = ${a.id} AND status = 'cancelled')
    `;
    await tx`
      UPDATE affiliates SET wallet_network = ${network}, wallet_address = ${address}, wallet_verified_at = NULL
      WHERE id = ${a.id}
    `;
    await tx`
      INSERT INTO affiliate_payouts (affiliate_id, kind, amount_cents, network, address)
      VALUES (${a.id}, 'test', ${TEST_PAYOUT_CENTS}, ${network}, ${address})
    `;
    return { changed: true };
  });
}

/** The affiliate confirms the $1 test arrived: the wallet is now trusted for real payouts. */
export async function confirmTestPayout(affiliate, payoutId) {
  return sql.begin(async (tx) => {
    const [a] = await tx`SELECT * FROM affiliates WHERE id = ${affiliate.id} FOR UPDATE`;
    const [p] = await tx`
      UPDATE affiliate_payouts SET status = 'confirmed', confirmed_at = now()
      WHERE id = ${payoutId} AND affiliate_id = ${a.id} AND kind = 'test' AND status = 'sent'
        AND network = ${a.wallet_network} AND address = ${a.wallet_address}
      RETURNING id
    `;
    if (!p) return { ok: false };
    await tx`UPDATE affiliates SET wallet_verified_at = now() WHERE id = ${a.id}`;
    return { ok: true };
  });
}

/** Asks for everything that can be withdrawn, to the verified wallet. */
export async function requestWithdrawal(affiliate) {
  return sql.begin(async (tx) => {
    const [a] = await tx`SELECT * FROM affiliates WHERE id = ${affiliate.id} FOR UPDATE`;
    if (!a.wallet_verified_at) return { ok: false, error: 'Confirm your $1 test payment first, so we know your wallet is right.' };
    const [open] = await tx`SELECT id FROM affiliate_payouts WHERE affiliate_id = ${a.id} AND kind = 'withdrawal' AND status = 'requested'`;
    if (open) return { ok: false, error: 'You already have a withdrawal on its way.' };
    const rows = await tx`
      SELECT id, amount_cents FROM affiliate_commissions
      WHERE affiliate_id = ${a.id} AND status = 'pending' AND payout_id IS NULL AND available_at <= now()
      FOR UPDATE
    `;
    const total = rows.reduce((s, r) => s + r.amount_cents, 0);
    if (total <= 0) return { ok: false, error: 'Nothing is ready to withdraw yet.' };
    const [p] = await tx`
      INSERT INTO affiliate_payouts (affiliate_id, kind, amount_cents, network, address)
      VALUES (${a.id}, 'withdrawal', ${total}, ${a.wallet_network}, ${a.wallet_address})
      RETURNING id
    `;
    await tx`UPDATE affiliate_commissions SET payout_id = ${p.id} WHERE id = ANY(${rows.map((r) => r.id)}::uuid[])`;
    return { ok: true, amountCents: total };
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminOpenPayouts() {
  return sql`
    SELECT p.*, a.code, u.email
    FROM affiliate_payouts p
    JOIN affiliates a ON a.id = p.affiliate_id
    JOIN users u ON u.id = a.user_id
    WHERE p.status = 'requested'
    ORDER BY p.kind DESC, p.requested_at ASC
  `;
}

export async function adminAffiliates() {
  return sql`
    SELECT a.id, a.code, a.status, a.wallet_network, a.wallet_verified_at, a.created_at, u.email,
      count(c.id) FILTER (WHERE c.status <> 'void')::int AS sales,
      COALESCE(sum(c.amount_cents) FILTER (WHERE c.status <> 'void'), 0)::int AS earned_cents,
      COALESCE(sum(c.amount_cents) FILTER (WHERE c.status = 'paid'), 0)::int AS paid_cents
    FROM affiliates a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN affiliate_commissions c ON c.affiliate_id = a.id
    GROUP BY a.id, u.email
    ORDER BY earned_cents DESC, a.created_at DESC
  `;
}

export async function adminRecentPayouts({ limit = 30 } = {}) {
  return sql`
    SELECT p.*, a.code, u.email
    FROM affiliate_payouts p
    JOIN affiliates a ON a.id = p.affiliate_id
    JOIN users u ON u.id = a.user_id
    WHERE p.status <> 'requested'
    ORDER BY COALESCE(p.sent_at, p.requested_at) DESC
    LIMIT ${limit}
  `;
}

/** Admin sent the USDT: record the transaction, and a withdrawal's commissions become paid. */
export async function adminMarkSent(payoutId, { txHash, adminId }) {
  const hash = String(txHash || '').trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(hash)) return { ok: false, error: 'Paste the transaction hash from the wallet or Cryptomus.' };
  return sql.begin(async (tx) => {
    const [p] = await tx`
      UPDATE affiliate_payouts SET status = 'sent', tx_hash = ${hash}, sent_at = now(), sent_by = ${adminId}
      WHERE id = ${payoutId} AND status = 'requested'
      RETURNING *
    `;
    if (!p) return { ok: false, error: 'This payout is no longer waiting.' };
    if (p.kind === 'withdrawal') {
      await tx`UPDATE affiliate_commissions SET status = 'paid' WHERE payout_id = ${p.id} AND status = 'pending'`;
    }
    return { ok: true };
  });
}

/** The transfer did not go through: the commissions go back to the balance. */
export async function adminMarkFailed(payoutId, { note }) {
  return sql.begin(async (tx) => {
    const [p] = await tx`
      UPDATE affiliate_payouts SET status = 'failed', note = ${String(note || '').slice(0, 300) || null}
      WHERE id = ${payoutId} AND status = 'requested'
      RETURNING *
    `;
    if (!p) return { ok: false, error: 'This payout is no longer waiting.' };
    await tx`UPDATE affiliate_commissions SET payout_id = NULL WHERE payout_id = ${p.id} AND status = 'pending'`;
    return { ok: true };
  });
}
