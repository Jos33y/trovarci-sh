// Sender license orders end to end against a real Postgres: the Cryptomus and Polar webhook
// routes are called with signed requests, exactly as the gateways send them.
//
//   TEST_DATABASE_URL=postgres://... node --import ./test/support/alias.mjs --test test/license-orders.test.mjs
//
// The database must be migrated. Every row the tests create is removed at the end.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const DB = process.env.TEST_DATABASE_URL;
if (!DB) throw new Error('TEST_DATABASE_URL is required');

const { privateKey } = crypto.generateKeyPairSync('ed25519');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: DB,
  LICENSE_PRIVATE_KEY_DER: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  CRYPTOMUS_MERCHANT_UUID: 'test-merchant',
  CRYPTOMUS_PAYMENT_API_KEY: 'test-cryptomus-key',
  POLAR_ENABLED: 'true',
  POLAR_ACCESS_TOKEN: 'test-polar-token',
  POLAR_WEBHOOK_SECRET: 'whsec_dGVzdC1wb2xhci1zZWNyZXQ=',
  PUBLIC_APP_URL: 'https://trovarci.test',
  VERIFICATION_CODE_PEPPER: 'test-pepper-test-pepper-test-pepper',
});
delete process.env.RESEND_API_KEY;

// Every line the app writes to the console during the tests, to prove no key reaches a log.
const logged = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => logged.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
}

const { sql } = await import('../app/utils/db.server.js');
const orders = await import('../app/lib/licenseOrders.server.js');
const { signBody } = await import('../app/lib/cryptomusSignature.server.js');
const cryptomusRoute = await import('../app/routes/api.webhooks.cryptomus.js');
const polarRoute = await import('../app/routes/api.webhooks.polar.js');

const created = { orders: [], users: [] };
const issuedKeys = [];

// ---------------------------------------------------------------------------

async function newOrder({ gateway = 'cryptomus', email = `buyer+${crypto.randomUUID().slice(0, 8)}@example.com`, userId = null, cents = 7900 } = {}) {
  const { order } = await orders.createOrder({ userId, email, priceKey: 'launch', amountUsdCents: cents, gateway });
  created.orders.push(order.id);
  const attempt = await openAttempt(order, cents);
  return { order, attempt };
}

async function openAttempt(order, cents) {
  const payment = await orders.createOrderPayment(order.id, { gateway: order.gateway, amountUsdCents: cents });
  const reference = order.gateway === 'polar' ? `chk_${crypto.randomUUID()}` : crypto.randomUUID();
  return orders.markOrderPaymentOpen(payment.id, { gatewayReference: reference, checkoutUrl: 'https://pay.example.test/x' });
}

function cryptomusRequest(fields, { key = process.env.CRYPTOMUS_PAYMENT_API_KEY } = {}) {
  const payload = { type: 'payment', is_final: true, ...fields };
  const sign = signBody(JSON.stringify(payload), key);
  const body = JSON.stringify({ ...payload, sign });
  return new Request('https://trovarci.test/api/webhooks/cryptomus', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body,
  });
}

const cryptomus = async (fields, opts) => {
  const res = await cryptomusRoute.action({ request: cryptomusRequest(fields, opts) });
  return { status: res.status, body: await res.json() };
};

function polarRequest(event, { secret = process.env.POLAR_WEBHOOK_SECRET } = {}) {
  const body = JSON.stringify(event);
  const id = `msg_${crypto.randomUUID()}`;
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${ts}.${body}`).digest('base64');
  return new Request('https://trovarci.test/api/webhooks/polar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` },
    body,
  });
}

const polar = async (event, opts) => {
  const res = await polarRoute.action({ request: polarRequest(event, opts) });
  return { status: res.status, body: res.status === 202 ? await res.json() : await res.text() };
};

const polarOrder = (order, attempt, extra = {}) => ({
  id: `ord_${crypto.randomUUID()}`,
  status: 'paid',
  paid: true,
  checkout_id: attempt.gateway_reference,
  currency: 'usd',
  total_amount: order.amount_usd_cents,
  net_amount: order.amount_usd_cents,
  tax_amount: 0,
  metadata: { license_order_id: order.id, product: 'sender', price_key: 'launch' },
  ...extra,
});

async function state(orderId) {
  const [order] = await sql`SELECT * FROM license_orders WHERE id = ${orderId}`;
  const licenses = await sql`
    SELECT l.* FROM licenses l JOIN license_orders o ON o.license_id = l.id WHERE o.id = ${orderId}`;
  const byRef = order.payment_reference
    ? await sql`SELECT count(*)::int AS n FROM licenses WHERE payment_reference = ${order.payment_reference}`
    : [{ n: 0 }];
  const audit = await sql`
    SELECT action_type, actor_id, actor_kind, context FROM admin_actions
    WHERE context->>'order_id' = ${orderId} ORDER BY id`;
  for (const l of licenses) issuedKeys.push(l.license_key);
  return { order, licenses, licensesForReference: byRef[0].n, audit };
}

// ---------------------------------------------------------------------------

test('Cryptomus paid, delivered twice, issues one license with a system audit row', async () => {
  const { order, attempt } = await newOrder();
  const event = { order_id: attempt.gateway_order_id, uuid: attempt.gateway_reference, status: 'paid', payment_amount_usd: '79.00', txid: 'tx-1', payer_currency: 'USDT' };

  const first = await cryptomus(event);
  const second = await cryptomus(event);
  assert.equal(first.body.reason, 'license_issued');
  assert.equal(second.body.reason, 'license_already_paid');

  const s = await state(order.id);
  assert.equal(s.order.status, 'paid');
  assert.equal(s.licenses.length, 1);
  assert.equal(s.licensesForReference, 1);
  assert.equal(s.licenses[0].max_devices, 3);
  assert.equal(s.licenses[0].entitlements, 1);
  assert.equal(s.licenses[0].issued_by, null);
  assert.equal(s.licenses[0].payment_reference, `cryptomus:${attempt.gateway_reference}`);
  assert.equal(s.audit.length, 1);
  assert.equal(s.audit[0].action_type, 'license_issue');
  assert.equal(s.audit[0].actor_kind, 'system');
  assert.equal(s.audit[0].actor_id, null);
  assert.equal(s.audit[0].context.payment_reference, `cryptomus:${attempt.gateway_reference}`);
  assert.ok(s.order.key_email_sent_at, 'key email recorded as sent');
});

test('the same paid webhook delivered at the same moment still issues one license', async () => {
  const { order, attempt } = await newOrder();
  const event = { order_id: attempt.gateway_order_id, uuid: attempt.gateway_reference, status: 'paid_over', payment_amount_usd: '80.10' };
  const results = await Promise.all(Array.from({ length: 5 }, () => cryptomus(event)));
  assert.equal(results.filter((r) => r.body.reason === 'license_issued').length, 1);
  const s = await state(order.id);
  assert.equal(s.licenses.length, 1);
  assert.equal(s.audit.filter((a) => a.action_type === 'license_issue').length, 1);
});

test('a bad Cryptomus signature is refused and changes nothing', async () => {
  const { order, attempt } = await newOrder();
  const res = await cryptomus({ order_id: attempt.gateway_order_id, status: 'paid', payment_amount_usd: '79.00' }, { key: 'wrong-key' });
  assert.equal(res.body.reason, 'invalid_signature');
  const s = await state(order.id);
  assert.equal(s.order.status, 'open');
  assert.equal(s.licenses.length, 0);
});

test('a bad Polar signature is refused with 403 and changes nothing', async () => {
  const { order, attempt } = await newOrder({ gateway: 'polar' });
  const res = await polar({ type: 'order.paid', data: polarOrder(order, attempt) }, { secret: 'whsec_bm90LXRoZS1zZWNyZXQ=' });
  assert.equal(res.status, 403);
  const s = await state(order.id);
  assert.equal(s.order.status, 'open');
  assert.equal(s.licenses.length, 0);
});

test('an underpayment issues nothing until the rest arrives on the same invoice', async () => {
  const { order, attempt } = await newOrder();
  const partial = await cryptomus({ order_id: attempt.gateway_order_id, status: 'wrong_amount_waiting', payment_amount_usd: '50.00', is_final: false });
  assert.equal(partial.body.reason, 'license_partial');
  let s = await state(order.id);
  assert.equal(s.licenses.length, 0);
  assert.equal(orders.paidSoFarCents(await orders.listOrderPayments(order.id)), 5000);

  await cryptomus({ order_id: attempt.gateway_order_id, status: 'paid', payment_amount_usd: '79.00' });
  s = await state(order.id);
  assert.equal(s.order.status, 'paid');
  assert.equal(s.licenses.length, 1);
});

test('a closed underpaid invoice plus a second invoice for the rest issues one license', async () => {
  const { order, attempt } = await newOrder();
  const short = await cryptomus({ order_id: attempt.gateway_order_id, status: 'wrong_amount', payment_amount_usd: '60.00' });
  assert.equal(short.body.reason, 'license_underpaid');
  assert.equal((await state(order.id)).licenses.length, 0);

  const rest = await openAttempt(order, 1900);
  assert.equal(rest.gateway_order_id, `${order.id}_2`);
  const paid = await cryptomus({ order_id: rest.gateway_order_id, uuid: rest.gateway_reference, status: 'paid', payment_amount_usd: '19.00' });
  assert.equal(paid.body.reason, 'license_issued');
  const s = await state(order.id);
  assert.equal(s.licenses.length, 1);
  assert.equal(s.licenses[0].payment_reference, `cryptomus:${rest.gateway_reference}`);
});

test('"paid" with too little money behind it issues nothing', async () => {
  const { order, attempt } = await newOrder();
  const res = await cryptomus({ order_id: attempt.gateway_order_id, status: 'paid', payment_amount_usd: '40.00' });
  assert.equal(res.body.reason, 'license_short');
  assert.equal((await state(order.id)).licenses.length, 0);
});

test('an expired invoice issues nothing, and a late payment on it still does', async () => {
  const { order, attempt } = await newOrder();
  const expired = await cryptomus({ order_id: attempt.gateway_order_id, status: 'cancel' });
  assert.equal(expired.body.reason, 'license_expired');
  assert.equal((await state(order.id)).licenses.length, 0);
  const [row] = await sql`SELECT status FROM license_order_payments WHERE id = ${attempt.id}`;
  assert.equal(row.status, 'expired');

  await cryptomus({ order_id: attempt.gateway_order_id, status: 'paid', payment_amount_usd: '79.00' });
  assert.equal((await state(order.id)).licenses.length, 1);
});

test('a Cryptomus refund revokes the license, audited, and a replayed paid event does not reissue', async () => {
  const { order, attempt } = await newOrder();
  const paid = { order_id: attempt.gateway_order_id, uuid: attempt.gateway_reference, status: 'paid', payment_amount_usd: '79.00' };
  await cryptomus(paid);
  const refund = await cryptomus({ ...paid, status: 'refund_paid' });
  assert.equal(refund.body.reason, 'license_refunded');
  await cryptomus(paid);

  const s = await state(order.id);
  assert.equal(s.order.status, 'refunded');
  assert.equal(s.licenses.length, 1);
  assert.equal(s.licenses[0].status, 'revoked');
  assert.deepEqual(s.audit.map((a) => [a.action_type, a.actor_kind]), [['license_issue', 'system'], ['license_revoke', 'system']]);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM licenses WHERE user_id = ${s.order.user_id}`;
  assert.equal(n, 1);
});

test('Polar order.paid twice issues one license; order.refunded revokes it', async () => {
  const { order, attempt } = await newOrder({ gateway: 'polar' });
  const data = polarOrder(order, attempt);
  const first = await polar({ type: 'order.paid', data });
  const second = await polar({ type: 'order.paid', data });
  assert.equal(first.body.reason, 'license_issued');
  assert.equal(second.body.reason, 'license_already_paid');
  let s = await state(order.id);
  assert.equal(s.licenses.length, 1);
  assert.equal(s.licenses[0].payment_reference, `polar:${data.id}`);

  const partial = await polar({ type: 'order.refunded', data: { ...data, status: 'partially_refunded' } });
  assert.equal(partial.body.reason, 'license_partial_refund_logged');
  assert.equal((await state(order.id)).licenses[0].status, 'active');

  const refund = await polar({ type: 'order.refunded', data: { ...data, status: 'refunded' } });
  assert.equal(refund.body.reason, 'license_refunded');
  s = await state(order.id);
  assert.equal(s.order.status, 'refunded');
  assert.equal(s.licenses[0].status, 'revoked');
  assert.equal(s.audit.at(-1).action_type, 'license_revoke');
});

test('Polar with tax added on top (US style) still matches the price', async () => {
  const { order, attempt } = await newOrder({ gateway: 'polar' });
  const res = await polar({ type: 'order.paid', data: polarOrder(order, attempt, { net_amount: 7900, tax_amount: 711, total_amount: 8611 }) });
  assert.equal(res.body.reason, 'license_issued');
});

test('a guest gets an account that cannot sign in until they set a password; a signed-in buyer keeps theirs', async () => {
  const email = `guest+${crypto.randomUUID().slice(0, 8)}@example.com`;
  const guest = await newOrder({ email });
  await cryptomus({ order_id: guest.attempt.gateway_order_id, status: 'paid', payment_amount_usd: '79.00' });
  const [user] = await sql`SELECT id, password_hash, credits_balance, email_verified_at FROM users WHERE email = ${email}`;
  created.users.push(user.id);
  assert.equal(user.credits_balance, 0);
  assert.equal(user.email_verified_at, null);
  const { verifyPassword } = await import('../app/utils/auth.server.js');
  assert.equal(await verifyPassword(user.password_hash, '!no-password'), false);
  assert.equal((await state(guest.order.id)).audit[0].context.created_account, true);

  const [member] = await sql`INSERT INTO users (email, password_hash) VALUES (${`member+${crypto.randomUUID().slice(0, 8)}@example.com`}, 'x') RETURNING id, email`;
  created.users.push(member.id);
  const own = await newOrder({ email: member.email, userId: member.id });
  await cryptomus({ order_id: own.attempt.gateway_order_id, status: 'paid', payment_amount_usd: '79.00' });
  const s = await state(own.order.id);
  assert.equal(s.licenses[0].user_id, member.id);
  assert.equal(s.audit[0].context.created_account, false);
});

test('the order page shows the key only to the owner or the browser holding the token', async () => {
  const { order: o, token } = await orders.createOrder({ email: 'viewer@example.com', priceKey: 'launch', amountUsdCents: 7900, gateway: 'cryptomus' });
  created.orders.push(o.id);
  assert.equal(await orders.getOrderForViewer(o.id, { tokens: [] }), null);
  assert.equal(await orders.getOrderForViewer(o.id, { tokens: ['A'.repeat(43)] }), null);
  assert.ok(await orders.getOrderForViewer(o.id, { tokens: [token] }));
  assert.equal(await orders.getOrderForViewer('not-a-uuid', { tokens: [token] }), null);
});

test('no license key appears in anything the app logged', () => {
  assert.ok(issuedKeys.length >= 8, `expected keys from the tests above, got ${issuedKeys.length}`);
  const all = logged.join('\n');
  assert.ok(all.includes('[EMAIL DEV MODE]'), 'the key emails were rendered in dev mode');
  assert.ok(all.includes('[redacted]'), 'the key email masked the key');
  for (const key of new Set(issuedKeys)) assert.equal(all.includes(key), false, 'a license key reached the console');
  assert.equal(/TROV1\.[A-Za-z0-9_-]{20,}/.test(all), false, 'something shaped like a key reached the console');
});

// ---------------------------------------------------------------------------

after(async () => {
  const ids = created.orders;
  if (ids.length) {
    const licenseIds = (await sql`SELECT license_id FROM license_orders WHERE id = ANY(${ids}::uuid[]) AND license_id IS NOT NULL`).map((r) => r.license_id);
    await sql`DELETE FROM admin_actions WHERE context->>'order_id' = ANY(${ids}::text[])`;
    await sql`DELETE FROM license_order_payments WHERE order_id = ANY(${ids}::uuid[])`;
    await sql`DELETE FROM license_orders WHERE id = ANY(${ids}::uuid[])`;
    if (licenseIds.length) await sql`DELETE FROM licenses WHERE id = ANY(${licenseIds}::uuid[])`;
  }
  await sql`DELETE FROM users WHERE email LIKE 'buyer+%@example.com' AND id NOT IN (SELECT user_id FROM licenses) AND id NOT IN (SELECT user_id FROM payments)`;
  if (created.users.length) await sql`DELETE FROM users WHERE id = ANY(${created.users}::uuid[]) AND id NOT IN (SELECT user_id FROM licenses)`;
  await sql.end({ timeout: 2 });
});

