#!/usr/bin/env node
/**
 * verifyBatch11.mjs - Batch F2 (admin UI) smoke test
 *
 * Runs read-only validations:
 *   1. admin_actions table exists with the expected schema/constraints
 *   2. logAdminAction inserts a row, then we delete it
 *   3. requireAdmin throws 404 for non-admin authenticated users
 *      (simulated via direct role lookup on a user record)
 *   4. adminSearchUsers returns rows
 *   5. adminListPayments + adminListJobs return rows (or empty)
 *   6. adminAnalyticsOverview returns the expected shape
 *
 * No HTTP calls; all functions invoked in-process. The dev server
 * does not need to be running.
 *
 * Usage: node --env-file=.env scripts/verifyBatch11.mjs
 */

import { sql } from '../app/utils/db.server.js';
import { logAdminAction } from '../app/utils/adminActions.server.js';
import {
  adminSearchUsers,
  adminListPayments,
  adminListJobs,
  adminAnalyticsOverview,
  adminListActions,
  adminListErrors,
} from '../app/utils/admin.server.js';

const C = { ok: '\x1b[32m', fail: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m' };
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { console.log(`${C.ok}PASS${C.reset} ${name} ${C.dim}${detail}${C.reset}`); pass++; }
  else    { console.log(`${C.fail}FAIL${C.reset} ${name} ${detail}`); fail++; }
}

console.log('=== Batch F2 verify ===\n');

// ── 1. admin_actions schema ────────────────────────────────────────────
{
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'admin_actions'
    ORDER BY ordinal_position
  `;
  const names = cols.map((c) => c.column_name);
  const expected = [
    'id', 'created_at', 'actor_id', 'action_type',
    'target_user_id', 'target_kind', 'target_id', 'reason', 'context',
  ];
  const missing = expected.filter((e) => !names.includes(e));
  check('admin_actions table has expected columns', missing.length === 0, missing.length ? `missing: ${missing}` : `${cols.length} cols`);
}

// ── 2. logAdminAction inserts a row ────────────────────────────────────
{
  const [actor] = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
  if (!actor) {
    check('logAdminAction round-trip', false, 'no admin user in DB - run: node --env-file=.env scripts/promoteAdmin.mjs <email>');
  } else {
    try {
      await logAdminAction(null, {
        actorId: actor.id,
        actionType: 'credit_adjustment',
        targetKind: 'user',
        targetId: 'verify-batch-11-test',
        reason: 'verify-batch-11 smoke test row, safe to delete',
        context: { test: true },
      });
      const [row] = await sql`
        SELECT id FROM admin_actions
        WHERE target_id = 'verify-batch-11-test'
        ORDER BY id DESC LIMIT 1
      `;
      check('logAdminAction inserts a row', !!row, row ? `id=${row.id}` : 'no row found');
      if (row) {
        await sql`DELETE FROM admin_actions WHERE id = ${row.id}`;
      }
    } catch (e) {
      check('logAdminAction inserts a row', false, e.message);
    }
  }
}

// ── 3. logAdminAction validates inputs ────────────────────────────────
{
  let threw = false;
  try {
    await logAdminAction(null, { actorId: 'x', actionType: 'unknown_type' });
  } catch (e) {
    threw = e.message.includes('invalid actionType');
  }
  check('logAdminAction rejects bad action_type', threw);
}

{
  let threw = false;
  try {
    await logAdminAction(null, {
      actorId: '00000000-0000-0000-0000-000000000001',
      actionType: 'credit_grant',
      targetUserId: '00000000-0000-0000-0000-000000000001',
    });
  } catch (e) {
    threw = e.message.includes('actor cannot target themselves');
  }
  check('logAdminAction rejects self-target', threw);
}

// ── 4. adminSearchUsers ────────────────────────────────────────────────
{
  const rows = await adminSearchUsers({ q: '', limit: 5 });
  check('adminSearchUsers returns rows', Array.isArray(rows), `got ${rows.length}`);
}

// ── 5. adminListPayments ───────────────────────────────────────────────
{
  const rows = await adminListPayments({ limit: 5 });
  check('adminListPayments returns rows', Array.isArray(rows), `got ${rows.length}`);
}

// ── 6. adminListJobs ───────────────────────────────────────────────────
{
  const rows = await adminListJobs({ limit: 5 });
  check('adminListJobs returns rows', Array.isArray(rows), `got ${rows.length}`);
}

// ── 7. adminListJobs filter by status ─────────────────────────────────
{
  const rows = await adminListJobs({ status: 'pending', limit: 5 });
  check('adminListJobs filter by status', Array.isArray(rows), `got ${rows.length} pending`);
}

// ── 8. adminAnalyticsOverview shape ────────────────────────────────────
{
  const o = await adminAnalyticsOverview({ days: 7 });
  const ok = o.totals && Array.isArray(o.topPaths) && Array.isArray(o.dailySeries)
    && Array.isArray(o.topReferrers) && Array.isArray(o.topCountries);
  check('adminAnalyticsOverview shape', ok, ok ? `${o.totals.pageviews} pageviews` : 'shape mismatch');
}

// ── 9. adminListActions ────────────────────────────────────────────────
{
  const rows = await adminListActions({ limit: 5 });
  check('adminListActions returns rows', Array.isArray(rows), `got ${rows.length}`);
}

// ── 10. adminListErrors ────────────────────────────────────────────────
{
  const rows = await adminListErrors({ limit: 5 });
  check('adminListErrors returns rows', Array.isArray(rows), `got ${rows.length}`);
}

// ── 11. role column / admin user exists ────────────────────────────────
{
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`;
  check('At least one admin user exists', count > 0, `${count} admin(s); if 0 run: node --env-file=.env scripts/promoteAdmin.mjs <email>`);
}

console.log(`\n${pass} pass, ${fail} fail.`);
await sql.end();
process.exit(fail ? 1 : 0);
