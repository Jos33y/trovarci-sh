#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────
   promoteAdmin.mjs

   Bootstrap helper: set users.role = 'admin' for an email. Used to
   create the first admin since /admin requires an existing admin to
   change roles via UI.

   Usage:
     node --env-file=.env scripts/promoteAdmin.mjs joe@example.com
     node --env-file=.env scripts/promoteAdmin.mjs joe@example.com --revoke

   Prints before/after role and a one-line audit reminder.
   ─────────────────────────────────────────────────────────────────────── */

import { sql } from '../app/utils/db.server.js';

const args = process.argv.slice(2);
const email = args[0];
const revoke = args.includes('--revoke');

if (!email || !email.includes('@')) {
  console.error('Usage: node --env-file=.env scripts/promoteAdmin.mjs <email> [--revoke]');
  process.exit(1);
}

const newRole = revoke ? 'user' : 'admin';

const [before] = await sql`
  SELECT id, email, role FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
`;

if (!before) {
  console.error(`User not found: ${email}`);
  await sql.end();
  process.exit(1);
}

if (before.role === newRole) {
  console.log(`No change: ${before.email} is already "${newRole}".`);
  await sql.end();
  process.exit(0);
}

const [after] = await sql`
  UPDATE users SET role = ${newRole}
  WHERE id = ${before.id}
  RETURNING id, email, role
`;

console.log(`${before.email}: ${before.role} -> ${after.role}`);
console.log('');
console.log('NOTE: this CLI bypasses admin_actions audit logging on purpose.');
console.log('It is intended for bootstrap only. Future role changes should go');
console.log('through the admin UI once a role-change form is added.');

await sql.end();
