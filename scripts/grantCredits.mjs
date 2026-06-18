#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/grantCredits.mjs

   Manually adjust a user's credit balance via the credit_transactions
   ledger.

   ─── DESIGN NOTES ───
   This script reimplements the SAME atomic transaction pattern as
   app/lib/credits.server.js#grantCredits, intentionally NOT importing
   that module. Reason: the lib uses Remix's `~/` import alias, which
   only resolves inside the Vite bundler. From a standalone Node CLI
   the alias breaks. So we duplicate ~20 lines of SQL here.

   IF YOU MODIFY app/lib/credits.server.js#grantCredits IN A WAY THAT
   AFFECTS THE LEDGER WRITE, MIRROR THE CHANGE HERE.

   ─── BEHAVIOUR ───
   1. Validates: positive integer amount (max 1M as safety net), reason
      ≥ 3 chars, valid email format.
   2. Locks the user row with SELECT FOR UPDATE (prevents concurrent
      tool runs from racing the balance read).
   3. Updates users.credits_balance.
   4. Inserts a credit_transactions row with type='adjustment' and
      metadata.{source, reason, operator_*}.
   5. Verifies the new balance against expected.

   ─── USAGE ───
     node --env-file=.env scripts/grantCredits.mjs \
       --email user@example.com \
       --amount 1000 \
       --reason "founder testing for bulk QA"

   Optional:
     --yes                Skip the confirmation prompt
     --reference-id <uuid>  For idempotent grants (re-running this
                            script with the same reference-id returns
                            the existing transaction instead of double
                            crediting). Use for batch CSV imports.

   ─── EXIT CODES ───
     0 = applied successfully OR aborted by user
     1 = validation error or DB error
   ═══════════════════════════════════════════════════════════════════════════ */
   
import postgres from 'postgres';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hostname } from 'node:os';

// =========================================================================
// 1. Args
// =========================================================================

function parseArgs(argv) {
  const args = {
    email: null,
    amount: null,
    reason: null,
    yes: false,
    referenceId: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--email':
      case '-e':
        args.email = next; i++; break;
      case '--amount':
      case '-a':
        args.amount = parseInt(next, 10); i++; break;
      case '--reason':
      case '-r':
        args.reason = next; i++; break;
      case '--reference-id':
        args.referenceId = next; i++; break;
      case '--yes':
      case '-y':
        args.yes = true; break;
      case '--help':
      case '-h':
        printUsage(); process.exit(0);
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown flag: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage:
  node --env-file=.env scripts/grantCredits.mjs --email <email> --amount <n> --reason <text> [options]

Required:
  --email, -e <email>          Target user email (case-insensitive)
  --amount, -a <n>             Number of credits to grant (1 to 1,000,000)
  --reason, -r <text>          Reason recorded in metadata.reason (min 3 chars)

Options:
  --yes, -y                    Skip the "Apply this grant?" prompt
  --reference-id <uuid>        Idempotency key. If a prior 'adjustment' transaction
                               for this user has the same reference_id, returns
                               that transaction instead of double-crediting.
                               Useful for batch grants from CSV.

Examples:
  node --env-file=.env scripts/grantCredits.mjs --email me@x.com --amount 1000 --reason "founder QA"
  node --env-file=.env scripts/grantCredits.mjs --email cust@x.com --amount 500 --reason "support ticket #1234" --yes
`);
}

const args = parseArgs(process.argv);

// =========================================================================
// 2. Validate
// =========================================================================

const errors = [];

if (!args.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
  errors.push('--email is required and must be a valid email address');
}
if (!Number.isInteger(args.amount) || args.amount <= 0) {
  errors.push(`--amount must be a positive integer, got: ${args.amount}`);
}
const MAX_GRANT = 1_000_000;
if (args.amount > MAX_GRANT) {
  errors.push(`--amount cannot exceed ${MAX_GRANT.toLocaleString()} (safety limit; raise in script if intentional)`);
}
if (!args.reason || args.reason.trim().length < 3) {
  errors.push('--reason must be at least 3 characters (audit trail)');
}
if (args.referenceId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.referenceId)) {
  errors.push('--reference-id must be a UUID (lowercase hex, 8-4-4-4-12)');
}
if (!process.env.DATABASE_URL) {
  errors.push('DATABASE_URL not set. Run with: node --env-file=.env scripts/grantCredits.mjs ...');
}

if (errors.length > 0) {
  console.error('');
  for (const e of errors) console.error('  ERROR: ' + e);
  console.error('');
  printUsage();
  process.exit(1);
}

// =========================================================================
// 3. Connect (single short-lived connection, not a pool)
// =========================================================================

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: true,
  onnotice: () => {},
});

// =========================================================================
// 4. Main
// =========================================================================

async function main() {
  const emailLower = args.email.toLowerCase().trim();

  // ── Step A. Look up the user (read-only, outside the transaction) ──
  // We do this BEFORE the transaction so we can show the user a preview
  // and ask for confirmation without holding a row lock.
  const userRows = await sql`
    SELECT id, email, credits_balance
    FROM users
    WHERE lower(email) = ${emailLower}
      AND deleted_at IS NULL
    LIMIT 1
  `;

  if (userRows.length === 0) {
    console.error('');
    console.error(`  ERROR: no active user found with email '${args.email}'`);
    console.error('');
    console.error('  Hint: user may be soft-deleted (deleted_at IS NOT NULL).');
    console.error('  Check with: SELECT id, email, deleted_at FROM users WHERE lower(email) = lower($1);');
    console.error('');
    await sql.end();
    process.exit(1);
  }

  const user = userRows[0];
  const previewBefore = Number(user.credits_balance);
  const previewAfter = previewBefore + args.amount;

  // ── Step B. Preview ──
  console.log('');
  console.log('  ───────────────────────────────────────────');
  console.log(`    User:           ${user.email}`);
  console.log(`    User ID:        ${user.id}`);
  console.log(`    Current balance: ${previewBefore.toLocaleString()} credits`);
  console.log(`    Grant:           +${args.amount.toLocaleString()} credits`);
  console.log(`    New balance:     ${previewAfter.toLocaleString()} credits  (preview - other tx may run)`);
  console.log(`    Type:            adjustment`);
  console.log(`    Reason:          ${args.reason}`);
  if (args.referenceId) {
    console.log(`    Reference ID:    ${args.referenceId} (idempotent)`);
  }
  console.log('  ───────────────────────────────────────────');
  console.log('');

  // ── Step C. Confirm ──
  if (!args.yes) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = await rl.question('  Apply this grant? [y/N]: ');
    rl.close();

    if (answer.trim().toLowerCase() !== 'y') {
      console.log('  Aborted. No changes made.');
      console.log('');
      await sql.end();
      process.exit(0);
    }
  }

  // ── Step D. Apply atomically (mirrors credits.server.js#grantCredits) ──
  const operatorMetadata = {
    source: 'cli:grantCredits',
    reason: args.reason,
    operator_hostname: hostname(),
    operator_pid: process.pid,
    operator_node_version: process.version,
  };

  const result = await sql.begin(async (tx) => {
    // D.1 Idempotency check (only when reference-id provided).
    if (args.referenceId) {
      const [existing] = await tx`
        SELECT id, balance_after, created_at
        FROM credit_transactions
        WHERE user_id = ${user.id}
          AND type = 'adjustment'
          AND reference_id = ${args.referenceId}
        LIMIT 1
      `;
      if (existing) {
        return {
          idempotent: true,
          transactionId: existing.id,
          newBalance: Number(existing.balance_after),
          createdAt: existing.created_at,
        };
      }
    }

    // D.2 Lock the user row. Concurrent spendCredits/grantCredits will
    //     wait until this transaction commits or rolls back.
    const [lockedUser] = await tx`
      SELECT credits_balance
      FROM users
      WHERE id = ${user.id} AND deleted_at IS NULL
      FOR UPDATE
    `;

    if (!lockedUser) {
      throw new Error(`User ${user.id} disappeared between preview and grant (deleted concurrently?)`);
    }

    const realBefore = Number(lockedUser.credits_balance);
    const realAfter = realBefore + args.amount;

    // D.3 Update balance.
    await tx`
      UPDATE users
      SET credits_balance = ${realAfter}
      WHERE id = ${user.id}
    `;

    // D.4 Insert the ledger row. Sign-vs-type CHECK constraint:
    //     'adjustment' allows any non-zero delta (positive here).
    const [row] = await tx`
      INSERT INTO credit_transactions (user_id, delta, balance_after, type, reference_id, metadata)
      VALUES (
        ${user.id},
        ${args.amount},
        ${realAfter},
        'adjustment',
        ${args.referenceId},
        ${sql.json(operatorMetadata)}
      )
      RETURNING id, balance_after, created_at
    `;

    return {
      idempotent: false,
      transactionId: row.id,
      newBalance: Number(row.balance_after),
      createdAt: row.created_at,
      realBefore,
    };
  });

  // ── Step E. Report ──
  console.log('');
  if (result.idempotent) {
    console.log('  Idempotent hit - existing transaction returned, NO new credit issued.');
    console.log(`  Transaction ID:  ${result.transactionId}`);
    console.log(`  Original date:   ${result.createdAt.toISOString()}`);
    console.log(`  Balance:         ${result.newBalance.toLocaleString()} credits (current, may have changed since)`);
  } else {
    console.log('  Granted.');
    console.log(`  Transaction ID:  ${result.transactionId}`);
    console.log(`  Created at:      ${result.createdAt.toISOString()}`);
    console.log(`  Balance:         ${result.realBefore.toLocaleString()} -> ${result.newBalance.toLocaleString()} credits`);

    // Drift check: if the locked-balance differed from preview, something
    // else moved the balance between preview and lock. Not an error, but
    // log it so the operator notices.
    if (result.realBefore !== previewBefore) {
      console.log('');
      console.log(`  Note: balance drifted between preview and lock (preview ${previewBefore} -> actual ${result.realBefore}).`);
      console.log('  Another transaction ran concurrently. The grant amount was applied correctly.');
    }
  }
  console.log('');

  await sql.end();
}

main().catch(async (err) => {
  console.error('');
  console.error('  ERROR:', err.message);

  if (err.code === '23514') {
    console.error('');
    console.error('  CHECK constraint violation. This is unexpected for a positive grant.');
    console.error('  Possible cause: ct_balance_nonneg (would only trigger if amount somehow went negative).');
  } else if (err.code === '23503') {
    console.error('');
    console.error('  Foreign-key violation. User row may have been deleted between preview and grant.');
  } else if (err.message.includes('relation') && err.message.includes('does not exist')) {
    console.error('');
    console.error('  A required table is missing. Run: npm run db:migrate');
    console.error(`  DATABASE_URL host: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1] || 'unknown'}`);
  }

  console.error('');
  try { await sql.end(); } catch {}
  process.exit(1);
});
