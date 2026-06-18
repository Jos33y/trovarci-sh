/**
 * Credit system configuration.
 *
 * Single source of truth for credit amounts and costs. All values are
 * env-overridable so you can tune in production without a code deploy.
 *
 * Pricing model varies per tool. Most tools charge a flat cost per call
 * (Email Scorer = 1 per scan, Phone Verifier = 2 per lookup). Email
 * Verifier and Phone Verifier each have a single + bulk variant, with
 * different cost shapes:
 *
 *   email_verify                 1 credit per single-email check (auth required)
 *   email_verify_bulk_per_5      1 credit per 5 emails in a bulk job (5x discount)
 *
 *   phone_verify                 2 credits per single carrier lookup (auth required)
 *   phone_verify_bulk_per_call   2 credits per number in a bulk job (NO discount)
 *
 * Bulk math at job start:
 *   email cost = Math.ceil(emails.length / 5) * email_verify_bulk_per_5
 *   phone cost = phones.length * phone_verify_bulk_per_call
 *
 * Why email gets a 5x bulk discount and phone does not:
 *   Email bulk infrastructure (IPRoyal residential proxy + SMTP probes)
 *   amortizes well across a list - bandwidth is the bottleneck and bulk
 *   batches are dramatically more efficient than one-off probes. Twilio
 *   Lookup, in contrast, has no batch endpoint - every call costs us
 *   $0.005 regardless of scale. There are no economies to pass on, so
 *   bulk pricing tracks single pricing exactly. Bulk's value prop for
 *   phone is workflow (CSV, async, retry, results CSV download) not price.
 *
 * Tools that call no external APIs (DNS Generator, SMTP Tester) are free
 * - the credit cost stays at 0 and the spendCredits call is bypassed by
 * the route, not by passing 0 (which would still write a usage row).
 */

function envInt(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${key} must be a non-negative integer, got: ${v}`);
  }
  return n;
}

// Signup bonus - granted atomically during user creation.
// Override with CREDITS_WELCOME_BONUS=0 to disable, or any positive integer.
export const WELCOME_BONUS_AMOUNT = envInt('CREDITS_WELCOME_BONUS', 10);

// Cost per unit of work. Used by tool backends when deducting credits.
// Email and Phone Verifier each have two pricing tiers - see file header.
export const CREDIT_COSTS = {
  email_score:                envInt('CREDITS_COST_EMAIL_SCORE', 1),
  email_verify:               envInt('CREDITS_COST_EMAIL_VERIFY', 1),
  email_verify_bulk_per_5:    envInt('CREDITS_COST_EMAIL_VERIFY_BULK_PER_5', 1),
  phone_verify:               envInt('CREDITS_COST_PHONE_VERIFY', 2),
  phone_verify_bulk_per_call: envInt('CREDITS_COST_PHONE_VERIFY_BULK_PER_CALL', 2),
  domain_check:               envInt('CREDITS_COST_DOMAIN_CHECK', 0),
  smtp_test:                  envInt('CREDITS_COST_SMTP_TEST', 0),
  dns_generate:               envInt('CREDITS_COST_DNS_GENERATE', 0),
};

/**
 * Compute the credit cost for a bulk EMAIL verification job.
 *
 * Centralised here so the route, the worker, and the credit-preview UI
 * all agree on the math. Rounds up: 1 email costs 1 credit just like
 * 5 emails do, but 6 emails cost 2 credits.
 *
 * @param {number} emailCount - sanitized count after dedupe + invalid filter
 * @returns {number} integer credit cost, minimum 1 for any positive count
 */
export function bulkEmailVerifyCost(emailCount) {
  if (!Number.isInteger(emailCount) || emailCount <= 0) return 0;
  return Math.ceil(emailCount / 5) * CREDIT_COSTS.email_verify_bulk_per_5;
}

/**
 * Compute the credit cost for a bulk PHONE verification job.
 *
 * Linear: every number costs the same as a single-mode lookup. No
 * batch discount because Twilio has no batch endpoint (see file header).
 *
 * @param {number} phoneCount - sanitized count after dedupe
 * @returns {number} integer credit cost
 */
export function bulkPhoneVerifyCost(phoneCount) {
  if (!Number.isInteger(phoneCount) || phoneCount <= 0) return 0;
  return phoneCount * CREDIT_COSTS.phone_verify_bulk_per_call;
}

/**
 * Generic dispatcher for bulk-job pricing. Used by /api/jobs/:id/cancel
 * and any other code path that needs to compute "what would this many
 * rows have cost?" without knowing the type up front.
 *
 * @param {'email'|'phone'} type
 * @param {number} rowCount
 * @returns {number}
 */
export function bulkCost(type, rowCount) {
  if (type === 'email') return bulkEmailVerifyCost(rowCount);
  if (type === 'phone') return bulkPhoneVerifyCost(rowCount);
  throw new Error(`bulkCost: unknown type "${type}"`);
}

// Low-balance threshold for dashboard banner (P1 feature).
export const LOW_BALANCE_THRESHOLD = envInt('CREDITS_LOW_BALANCE_THRESHOLD', 100);

// Hard ceiling on bulk job sizes. Enforced by the route before credits
// are spent. Email higher because typical lists are larger; phone lower
// because per-row cost is 10x higher and Twilio rate limits cap throughput.
export const BULK_EMAIL_MAX_ROWS = envInt('BULK_EMAIL_MAX_ROWS', 50_000);
export const BULK_PHONE_MAX_ROWS = envInt('BULK_PHONE_MAX_ROWS', 10_000);
