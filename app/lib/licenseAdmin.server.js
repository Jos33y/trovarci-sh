// Admin side of Sender licensing: listings, and the issue / revoke / release operations
// that must commit together with their audit row.

import { sql } from '~/utils/db.server';
import { logAdminAction } from '~/utils/adminActions.server';
import { issueLicense, revokeLicense, releaseDevice, DEFAULT_MAX_DEVICES } from '~/lib/licenses.server';

export const MAX_DEVICES_LIMIT = 50;
export const LICENSE_STATUSES = ['active', 'revoked'];

// The same id the app prints on its certificate, so support can match a screenshot.
export function displayId(id) {
  return String(id).toUpperCase();
}

// The audit table forbids an admin targeting themselves. A license issued to the
// admin's own account names the license as the target and the owner in context.
function auditTarget(actorId, ownerId) {
  return ownerId === actorId ? null : ownerId;
}

export async function listLicensesForUser(userId) {
  const licenses = await sql`
    SELECT l.*,
           issuer.email AS issued_by_email,
           (SELECT count(*)::int FROM license_activations a
             WHERE a.license_id = l.id AND a.released_at IS NULL) AS live_devices
    FROM licenses l
    LEFT JOIN users issuer ON issuer.id = l.issued_by
    WHERE l.user_id = ${userId}
    ORDER BY l.issued_at DESC
  `;
  if (licenses.length === 0) return [];

  const ids = licenses.map((l) => l.id);
  const devices = await sql`
    SELECT id, license_id, device_id, device_label, app_version, platform, activated_at, last_seen_at
    FROM license_activations
    WHERE license_id = ANY(${ids}::uuid[]) AND released_at IS NULL
    ORDER BY activated_at ASC
  `;

  return licenses.map((l) => ({
    ...l,
    devices: devices.filter((d) => d.license_id === l.id),
  }));
}

export async function adminListLicenses({ q = '', status = null, limit = 100 } = {}) {
  const term = String(q || '').trim();
  const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const statusFilter = LICENSE_STATUSES.includes(status) ? status : null;

  return sql`
    SELECT l.id, l.user_id, l.status, l.max_devices, l.issued_at, l.revoked_at,
           l.payment_reference, u.email AS owner_email,
           (SELECT count(*)::int FROM license_activations a
             WHERE a.license_id = l.id AND a.released_at IS NULL) AS live_devices,
           (SELECT max(a.last_seen_at) FROM license_activations a
             WHERE a.license_id = l.id AND a.released_at IS NULL) AS last_seen_at
    FROM licenses l
    JOIN users u ON u.id = l.user_id
    WHERE (${statusFilter}::text IS NULL OR l.status = ${statusFilter})
      AND (${term} = '' OR u.email ILIKE ${like} OR l.id::text ILIKE ${like}
           OR l.payment_reference ILIKE ${like})
    ORDER BY l.issued_at DESC
    LIMIT ${limit}
  `;
}

export async function adminLicenseCounts() {
  const [row] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'active')::int AS active,
           count(*) FILTER (WHERE status = 'revoked')::int AS revoked,
           (SELECT count(*)::int FROM license_activations a
              JOIN licenses l ON l.id = a.license_id
             WHERE a.released_at IS NULL AND l.status = 'active') AS live_devices
    FROM licenses
  `;
  return row;
}

export async function adminIssueLicense({ actor, owner, maxDevices = DEFAULT_MAX_DEVICES, paymentReference = null, reason, issueToken = null }) {
  return sql.begin(async (tx) => {
    const license = await issueLicense({
      userId: owner.id,
      maxDevices,
      paymentReference,
      issuedBy: actor.id,
    }, tx);

    await logAdminAction(tx, {
      actorId: actor.id,
      actionType: 'license_issue',
      targetUserId: auditTarget(actor.id, owner.id),
      targetKind: 'license',
      targetId: license.id,
      reason,
      context: {
        owner_id: owner.id,
        owner_email: owner.email,
        max_devices: maxDevices,
        payment_reference: paymentReference,
        self_issued: owner.id === actor.id,
        issue_token: issueToken,
      },
    });

    return license;
  });
}

// The issue form carries a one-time token. A resubmit of the same form finds the license
// the first submit created instead of signing a second one.
export async function findIssuedByToken(issueToken) {
  if (!issueToken) return null;
  const [row] = await sql`
    SELECT target_id FROM admin_actions
    WHERE action_type = 'license_issue' AND context->>'issue_token' = ${issueToken}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return row?.target_id ?? null;
}

// Returns { ok:false } when the license is not active or not this owner's, so a
// stale form cannot revoke twice or reach across accounts.
export async function adminRevokeLicense({ actor, ownerId, licenseId, reason }) {
  return sql.begin(async (tx) => {
    const [row] = await tx`SELECT id FROM licenses WHERE id = ${licenseId} AND user_id = ${ownerId}`;
    if (!row) return { ok: false };

    const result = await revokeLicense({ licenseId, reason }, tx);
    if (!result.ok) return { ok: false };

    await logAdminAction(tx, {
      actorId: actor.id,
      actionType: 'license_revoke',
      targetUserId: auditTarget(actor.id, ownerId),
      targetKind: 'license',
      targetId: licenseId,
      reason,
      context: { owner_id: ownerId },
    });
    return { ok: true };
  });
}

export async function adminReleaseDevice({ actor, ownerId, licenseId, activationId, reason }) {
  return sql.begin(async (tx) => {
    const [device] = await tx`
      SELECT a.device_id, a.device_label
      FROM license_activations a
      JOIN licenses l ON l.id = a.license_id
      WHERE a.id = ${activationId} AND a.license_id = ${licenseId} AND l.user_id = ${ownerId}
        AND a.released_at IS NULL
    `;
    if (!device) return { ok: false };

    const result = await releaseDevice({ licenseId, activationId }, tx);
    if (!result.ok) return { ok: false };

    await logAdminAction(tx, {
      actorId: actor.id,
      actionType: 'license_device_release',
      targetUserId: auditTarget(actor.id, ownerId),
      targetKind: 'license',
      targetId: licenseId,
      reason,
      context: {
        owner_id: ownerId,
        activation_id: activationId,
        device_id: device.device_id,
        device_label: device.device_label,
      },
    });
    return { ok: true };
  });
}

// License actions on the admin's own account carry no target_user_id, so the user
// page's audit list would miss them. This finds them by the license they touched.
export async function listLicenseActionsForUser(userId, { limit = 25 } = {}) {
  return sql`
    SELECT aa.id, aa.action_type, aa.reason, aa.created_at, aa.actor_id, actor.email AS actor_email
    FROM admin_actions aa
    LEFT JOIN users actor ON actor.id = aa.actor_id
    WHERE aa.target_kind = 'license'
      AND aa.context->>'owner_id' = ${userId}
    ORDER BY aa.created_at DESC
    LIMIT ${limit}
  `;
}
