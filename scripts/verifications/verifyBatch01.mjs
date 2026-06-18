#!/usr/bin/env node
/**
 * scripts/verifyBatch01.mjs
 *
 * Verifies that the Batch 1 migration applied cleanly and the
 * creditsConfig patch returns correct values. No psql required.
 *
 * Run:
 *
 *     node --env-file=.env scripts/verifyBatch01.mjs
 *
 * (Node 20+. If you're on an older Node, run via dotenv-cli instead:
 *  npx dotenv -e .env -- node scripts/verifyBatch01.mjs)
 *
 * Exit code: 0 if all checks pass, 1 otherwise.
 */

import postgres from 'postgres';
import { CREDIT_COSTS, bulkEmailVerifyCost } from '../app/utils/creditsConfig.server.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Run with --env-file=.env or via dotenv-cli.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

const passes = [];
const fails = [];

function pass(msg) {
  passes.push(msg);
  console.log(`[OK]   ${msg}`);
}
function fail(msg) {
  fails.push(msg);
  console.log(`[FAIL] ${msg}`);
}

// =========================================================================
// Expected schema (mirror of the migration)
// =========================================================================

const EXPECTED = {
  verification_jobs: {
    columns: [
      'id', 'user_id', 'type', 'status',
      'total_rows', 'processed_rows', 'credits_held', 'hold_transaction_id',
      'csv_input_key', 'csv_output_key', 'metadata',
      'created_at', 'updated_at', 'started_at', 'completed_at', 'expires_at',
    ],
    checkConstraints: [
      'vj_type_valid',
      'vj_status_valid',
      'vj_total_positive',
      'vj_processed_bound',
      'vj_credits_held_nonneg',
      'vj_completed_when_terminal',
    ],
    indexes: [
      'verification_jobs_pkey',
      'vj_user_created',
      'vj_status_active',
      'vj_expires_cleanup',
    ],
    triggers: [
      'verification_jobs_set_updated_at',
    ],
  },
  verification_job_items: {
    columns: [
      'id', 'job_id', 'row_index', 'input', 'status',
      'category', 'subcategory', 'smtp_response', 'result',
      'attempts', 'next_retry', 'claimed_at', 'processed_at', 'error_code',
    ],
    checkConstraints: [
      'vji_status_valid',
      'vji_category_valid',
      'vji_subcategory_valid',
      'vji_attempts_bound',
      'vji_row_index_nonneg',
    ],
    indexes: [
      'verification_job_items_pkey',
      'vji_job_status',
      'vji_claim',
      'vji_job_row_order',
    ],
    triggers: [],
  },
  domain_catchall_cache: {
    columns: [
      'domain', 'is_catchall', 'detected_via', 'last_checked', 'expires_at',
    ],
    checkConstraints: [
      'dcc_detected_via_valid',
    ],
    indexes: [
      'domain_catchall_cache_pkey',
      'dcc_expires',
    ],
    triggers: [],
  },
};

// =========================================================================
// Schema checks
// =========================================================================

async function checkTablesExist() {
  console.log('\n--- Tables ---');
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${Object.keys(EXPECTED)})
  `;
  const present = new Set(rows.map((r) => r.table_name));
  for (const t of Object.keys(EXPECTED)) {
    if (present.has(t)) pass(`Table exists: ${t}`);
    else fail(`Table missing: ${t}`);
  }
}

async function checkColumns(table) {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  const present = new Set(rows.map((r) => r.column_name));
  const expected = EXPECTED[table].columns;
  const missing = expected.filter((c) => !present.has(c));
  if (missing.length === 0) {
    pass(`${table} columns: ${expected.length}/${expected.length} present`);
  } else {
    fail(`${table} columns missing: ${missing.join(', ')}`);
  }
}

async function checkConstraints(table) {
  const rows = await sql`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND constraint_type = 'CHECK'
  `;
  const present = new Set(rows.map((r) => r.constraint_name));
  const expected = EXPECTED[table].checkConstraints;
  const missing = expected.filter((c) => !present.has(c));
  if (missing.length === 0) {
    pass(`${table} CHECK constraints: ${expected.length}/${expected.length} present`);
  } else {
    fail(`${table} CHECK constraints missing: ${missing.join(', ')}`);
  }
}

async function checkIndexes() {
  console.log('\n--- Indexes ---');
  const allExpected = Object.values(EXPECTED).flatMap((t) => t.indexes);
  const tableNames = Object.keys(EXPECTED);
  const rows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY(${tableNames})
  `;
  const present = new Set(rows.map((r) => r.indexname));
  const missing = allExpected.filter((i) => !present.has(i));
  if (missing.length === 0) {
    pass(`Indexes: ${allExpected.length}/${allExpected.length} present`);
  } else {
    fail(`Indexes missing: ${missing.join(', ')}`);
  }
}

async function checkTriggers() {
  console.log('\n--- Triggers ---');
  for (const [table, spec] of Object.entries(EXPECTED)) {
    if (spec.triggers.length === 0) continue;
    // Filter out system FK enforcement triggers (RI_*, pg_*).
    const rows = await sql`
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid = ${`public.${table}`}::regclass
        AND NOT tgisinternal
    `;
    const present = new Set(rows.map((r) => r.tgname));
    for (const t of spec.triggers) {
      if (present.has(t)) pass(`Trigger on ${table}: ${t}`);
      else fail(`Trigger on ${table} missing: ${t}`);
    }
  }
}

async function checkExistingTablesUntouched() {
  console.log('\n--- Sanity: existing tables still present ---');
  const expected = ['users', 'sessions', 'email_verification_codes',
                    'auth_rate_limits', 'credit_transactions', 'payments'];
  const rows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${expected})
  `;
  const present = new Set(rows.map((r) => r.table_name));
  const missing = expected.filter((t) => !present.has(t));
  if (missing.length === 0) {
    pass(`Existing tables intact: ${expected.length}/${expected.length}`);
  } else {
    fail(`Existing tables missing (Batch 1 broke something!): ${missing.join(', ')}`);
  }
}

// =========================================================================
// bulkEmailVerifyCost smoke test
// =========================================================================

function checkCostMath() {
  console.log('\n--- bulkEmailVerifyCost smoke test ---');

  // Sanity: the underlying cost tokens must be present
  if (CREDIT_COSTS.email_verify === 1) pass(`CREDIT_COSTS.email_verify = 1`);
  else fail(`CREDIT_COSTS.email_verify = ${CREDIT_COSTS.email_verify}, expected 1`);

  if (CREDIT_COSTS.email_verify_bulk_per_100 === 1) {
    pass(`CREDIT_COSTS.email_verify_bulk_per_100 = 1`);
  } else {
    fail(`CREDIT_COSTS.email_verify_bulk_per_100 = ${CREDIT_COSTS.email_verify_bulk_per_100}, expected 1`);
  }

  const cases = [
    { count: 0,     expected: 0 },
    { count: 1,     expected: 1 },
    { count: 50,    expected: 1 },
    { count: 100,   expected: 1 },
    { count: 101,   expected: 2 },
    { count: 250,   expected: 3 },
    { count: 5000,  expected: 50 },
    { count: 50000, expected: 500 },
    // Edge: non-integer or negative inputs return 0
    { count: -1,    expected: 0 },
    { count: 1.5,   expected: 0 },
  ];
  for (const c of cases) {
    const got = bulkEmailVerifyCost(c.count);
    if (got === c.expected) {
      pass(`bulkEmailVerifyCost(${c.count}) = ${got}`);
    } else {
      fail(`bulkEmailVerifyCost(${c.count}) = ${got}, expected ${c.expected}`);
    }
  }
}

// =========================================================================
// Run
// =========================================================================

console.log('=== Batch 1 verification ===');

try {
  await checkTablesExist();

  console.log('\n--- Columns ---');
  for (const t of Object.keys(EXPECTED)) await checkColumns(t);

  console.log('\n--- CHECK constraints ---');
  for (const t of Object.keys(EXPECTED)) await checkConstraints(t);

  await checkIndexes();
  await checkTriggers();
  await checkExistingTablesUntouched();

  checkCostMath();
} catch (err) {
  console.error('\nSCRIPT ERROR:', err.message);
  fails.push(`script: ${err.message}`);
} finally {
  await sql.end({ timeout: 5 });
}

console.log('\n=== Summary ===');
console.log(`${passes.length} passed, ${fails.length} failed`);
if (fails.length === 0) {
  console.log('\nBatch 1 is green. Reply with "Batch 1 green" to ship Batch 2.');
  process.exit(0);
} else {
  console.log('\nFailures:');
  for (const f of fails) console.log(`  - ${f}`);
  console.log('\nFix before shipping Batch 2.');
  process.exit(1);
}
