/**
 * Write a row to admin_actions.
 *
 * Keep this thin: one INSERT, no business logic. The credit grant /
 * refund / cancel mutations call this BEFORE their own write, in the
 * same transaction where applicable, so audit and ledger commit
 * atomically.
 *
 * Usage:
 *
 *   await sql.begin(async (tx) => {
 *     await logAdminAction(tx, {
 *       actorId,
 *       actionType: 'credit_grant',
 *       targetUserId,
 *       targetKind: 'user',
 *       reason,
 *       context: { amount, granted_type: 'grant' },
 *     });
 *     await grantCreditsInTx(tx, { ... });
 *   });
 *
 * For paths where we cannot wrap the underlying mutation in a tx
 * (because grantCredits opens its own tx), call logAdminAction()
 * with the top-level `sql` import; the worst case is a ledger row
 * with no audit log row if the audit insert fails AFTER the ledger
 * write - rare and detectable via the action_type/reference_id mismatch.
 */

import { sql } from './db.server.js';

const VALID_ACTION_TYPES = new Set([
  'credit_grant',
  'credit_refund',
  'credit_adjustment',
  'job_cancel',
  'payment_mark_failed',
  'error_mark_resolved',
  'user_role_change',
]);

const VALID_TARGET_KINDS = new Set([
  'user', 'payment', 'job', 'transaction', 'error_event',
]);

/**
 * @param {object|*} executor - either the top-level `sql` or a `tx`
 *                              from `sql.begin`. Same tagged-template API.
 * @param {object} params
 * @param {string} params.actorId       UUID of the admin user
 * @param {string} params.actionType    one of VALID_ACTION_TYPES
 * @param {string} [params.targetUserId]  UUID of the affected user
 * @param {string} [params.targetKind]  one of VALID_TARGET_KINDS
 * @param {string} [params.targetId]    string ID of the target row
 * @param {string} [params.reason]      free-text human "why"
 * @param {object} [params.context]     typed payload
 */
export async function logAdminAction(executor, {
  actorId,
  actionType,
  targetUserId = null,
  targetKind = null,
  targetId = null,
  reason = null,
  context = {},
}) {
  if (!actorId)       throw new Error('logAdminAction: actorId required');
  if (!actionType)    throw new Error('logAdminAction: actionType required');
  if (!VALID_ACTION_TYPES.has(actionType)) {
    throw new Error(`logAdminAction: invalid actionType "${actionType}"`);
  }
  if (targetKind && !VALID_TARGET_KINDS.has(targetKind)) {
    throw new Error(`logAdminAction: invalid targetKind "${targetKind}"`);
  }
  if (targetUserId && targetUserId === actorId) {
    throw new Error('logAdminAction: actor cannot target themselves');
  }

  const exec = executor || sql;
  await exec`
    INSERT INTO admin_actions (
      actor_id, action_type, target_user_id, target_kind, target_id, reason, context
    ) VALUES (
      ${actorId}, ${actionType}, ${targetUserId}, ${targetKind}, ${targetId},
      ${reason}, ${exec.json(context)}
    )
  `;
}
