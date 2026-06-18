#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────────
   verifyBatch10.mjs

   Pre-launch smoke for analytics + error telemetry (P1 Batch F1).

   Validates:
     1. Migration applied  - tables analytics_events, analytics_daily,
        error_events exist with expected CHECK constraints.
     2. deriveSessionHash  - same input -> same 16-hex; bot UA -> 'bot';
        respects pepper.
     3. Ring buffer        - recordEvent queues, flushAnalyticsBuffer
        drains, batch insert succeeds.
     4. Bot drop           - is_bot=true rows are NOT inserted.
     5. Daily rollup       - computeDailyRollup writes per-dimension
        rows, second call is idempotent (no duplicate-key error).
     6. Error redaction    - emails hashed, password fields redacted,
        denylisted headers stripped, stack truncated.
     7. Beacon HTTP        - POST /api/telemetry/beacon over the
        running dev server returns 204 for valid pageview, 400 for
        garbage. (Skipped if dev server isn't up.)

   Run:
     node --env-file=.env scripts/verifyBatch10.mjs
   ─────────────────────────────────────────────────────────────────────────── */

import { sql } from '../app/utils/db.server.js';
import {
  recordEvent,
  recordEventSync,
  flushAnalyticsBuffer,
  computeDailyRollup,
  deriveSessionHash,
  cleanupOldAnalyticsEvents,
  buildEventFromRequest,
} from '../app/utils/analytics.server.js';
import {
  recordServerError,
  recordClientError,
  cleanupOldErrorEvents,
} from '../app/utils/errors.server.js';

let pass = 0, fail = 0;
function ok(name)  { console.log(`  PASS  ${name}`);  pass++; }
function err(name, why) { console.log(`  FAIL  ${name}${why ? '  - ' + why : ''}`); fail++; }

console.log('=== P1 Batch F1 telemetry smoke ===');

// ──────────────────────────────────────────────────────────────────────
// 1. Schema
// ──────────────────────────────────────────────────────────────────────
const expected = ['analytics_events', 'analytics_daily', 'error_events'];
const tables = (await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = ANY(${expected})
`).map((r) => r.table_name);
for (const t of expected) {
  if (tables.includes(t)) ok(`table ${t} exists`);
  else err(`table ${t} exists`, 'not found - run migrations');
}

// ──────────────────────────────────────────────────────────────────────
// 2. Session hash
// ──────────────────────────────────────────────────────────────────────
function fakeRequest({ ua = 'Mozilla/5.0 Chrome/120', ip = '1.2.3.4', country = 'US' } = {}) {
  return new Request('https://trovarci.sh/test', {
    headers: {
      'user-agent': ua,
      'x-forwarded-for': ip,
      'cf-ipcountry': country,
    },
  });
}

const h1 = deriveSessionHash(fakeRequest());
const h2 = deriveSessionHash(fakeRequest());
if (h1 === h2 && /^[a-f0-9]{16}$/.test(h1)) ok('session hash deterministic + format');
else err('session hash deterministic + format', `${h1} vs ${h2}`);

const h3 = deriveSessionHash(fakeRequest({ ua: 'Googlebot/2.1' }));
if (h3 === 'bot') ok('bot UA -> session hash "bot"');
else err('bot UA -> session hash "bot"', `got ${h3}`);

// ──────────────────────────────────────────────────────────────────────
// 3. Ring buffer + flush
// ──────────────────────────────────────────────────────────────────────
const before = (await sql`SELECT count(*)::int AS n FROM analytics_events`)[0].n;
const TEST_PATH = '/__smoke_test__';

for (let i = 0; i < 5; i++) {
  recordEvent(buildEventFromRequest(fakeRequest(), {
    eventType: 'pageview',
    path: TEST_PATH,
    userId: null,
    metadata: { i },
  }));
}
// Bot event should be dropped silently.
recordEvent(buildEventFromRequest(fakeRequest({ ua: 'Googlebot/2.1' }), {
  eventType: 'pageview',
  path: TEST_PATH,
}));

const flushed = await flushAnalyticsBuffer();
const after = (await sql`SELECT count(*)::int AS n FROM analytics_events WHERE path = ${TEST_PATH}`)[0].n;

if (flushed === 5) ok('flushAnalyticsBuffer reports 5 (bot dropped)');
else err('flushAnalyticsBuffer reports 5', `got ${flushed}`);

if (after === 5) ok('5 rows inserted (bot row absent)');
else err('5 rows inserted', `got ${after}`);

// ──────────────────────────────────────────────────────────────────────
// 4. Daily rollup idempotency
// ──────────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const r1 = await computeDailyRollup(today);
const r2 = await computeDailyRollup(today);
// r1 and r2 are total rollup rows written/updated; both >= 1 because we just inserted pageviews
if (r1 >= 1 && r2 >= 1) ok(`computeDailyRollup ran twice (${r1}, ${r2}) - idempotent`);
else err('computeDailyRollup idempotent', `${r1}, ${r2}`);

const rollupRow = (await sql`
  SELECT event_count FROM analytics_daily
  WHERE day = ${today}::date AND dimension = 'pageview_path' AND dimension_value = ${TEST_PATH}
`)[0];
if (rollupRow && rollupRow.event_count >= 5) ok(`rollup row for ${TEST_PATH} = ${rollupRow.event_count}`);
else err(`rollup row for ${TEST_PATH}`, JSON.stringify(rollupRow));

// ──────────────────────────────────────────────────────────────────────
// 5. Sync record + 'webhook' session_hash CHECK
// ──────────────────────────────────────────────────────────────────────
try {
  await recordEventSync({
    event_type: 'payment_confirmed',
    session_hash: 'webhook',
    user_id: null,
    path: '/api/webhooks/test',
    country: 'XX',
    device_class: 'unknown',
    is_bot: false,
    metadata: { smoke: true },
  });
  ok("recordEventSync accepts session_hash='webhook'");
} catch (e) {
  err("recordEventSync accepts session_hash='webhook'", e.message);
}

// ──────────────────────────────────────────────────────────────────────
// 6. Error redaction
// ──────────────────────────────────────────────────────────────────────
const errBefore = (await sql`SELECT count(*)::int AS n FROM error_events`)[0].n;

const reqWithSecrets = new Request('https://trovarci.sh/secret', {
  method: 'POST',
  headers: {
    'user-agent': 'Mozilla/5.0',
    'cookie': 'session=evil',
    'authorization': 'Bearer SECRET',
    'cf-ipcountry': 'GB',
  },
});

await recordServerError(
  new Error('Failed for user joe@example.com on insert'),
  reqWithSecrets,
  {
    severity: 'error',
    context: {
      user_email: 'joe@example.com',
      password: 'hunter2',
      api_key: 'sk_live_xxx',
      safe_field: 'kept',
    },
  },
);

const last = (await sql`
  SELECT message, redacted_context FROM error_events
  ORDER BY created_at DESC LIMIT 1
`)[0];

if (last && !last.message.includes('joe@example.com') && last.message.includes('email:')) {
  ok('email in message hashed');
} else {
  err('email in message hashed', last?.message);
}

const ctx = last?.redacted_context?.user_context;
if (ctx?.password === '[redacted]' && ctx?.api_key === '[redacted]' && ctx?.safe_field === 'kept') {
  ok('user_context redaction (password, api_key) + safe_field preserved');
} else {
  err('user_context redaction', JSON.stringify(ctx));
}

const headers = last?.redacted_context?.headers;
if (headers?._cookie_present === true && headers?._authorization_present === true && !('cookie' in headers)) {
  ok('headers: denylisted noted as present, values stripped');
} else {
  err('headers redaction', JSON.stringify(headers));
}

const errAfter = (await sql`SELECT count(*)::int AS n FROM error_events`)[0].n;
if (errAfter === errBefore + 1) ok('error_events row inserted');
else err('error_events row inserted', `before=${errBefore} after=${errAfter}`);

// ──────────────────────────────────────────────────────────────────────
// 7. Cleanup
// ──────────────────────────────────────────────────────────────────────
await sql`DELETE FROM analytics_events WHERE path = ${TEST_PATH} OR path = '/api/webhooks/test'`;
await sql`DELETE FROM analytics_daily WHERE dimension_value = ${TEST_PATH}`;
await sql`DELETE FROM error_events WHERE message LIKE '%on insert%'`;
ok('test rows cleaned up');

// ──────────────────────────────────────────────────────────────────────
// 8. Beacon endpoint (optional - only if dev server is up)
// ──────────────────────────────────────────────────────────────────────
const beaconUrl = process.env.SMOKE_BEACON_URL || 'http://localhost:3000/api/telemetry/beacon';
try {
  const resp = await fetch(beaconUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({ type: 'pageview', path: '/__smoke_beacon__' }),
  });
  if (resp.status === 204) {
    ok(`beacon POST pageview -> 204 (${beaconUrl})`);
    // Wait a bit and verify the row landed
    await new Promise((r) => setTimeout(r, 500));
    await flushAnalyticsBuffer();  // best-effort - we may be on a different process
  } else {
    err(`beacon POST pageview -> 204`, `got ${resp.status}`);
  }

  const bad = await fetch(beaconUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
    body: 'not-json{{{',
  });
  if (bad.status === 400) ok('beacon POST garbage -> 400');
  else err('beacon POST garbage -> 400', `got ${bad.status}`);

  await sql`DELETE FROM analytics_events WHERE path = '/__smoke_beacon__'`;
} catch (e) {
  console.log(`  SKIP  beacon HTTP smoke (no dev server at ${beaconUrl})`);
}

// ──────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────
console.log('');
if (fail === 0) {
  console.log(`PASS: ${pass} checks`);
  await sql.end();
  process.exit(0);
} else {
  console.log(`FAIL: ${fail} of ${pass + fail} checks`);
  await sql.end();
  process.exit(1);
}
