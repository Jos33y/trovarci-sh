// Credit system configuration. Single source of truth for credit amounts and action costs.

function envInt(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${key} must be a non-negative integer, got: ${v}`);
  }
  return n;
}

// Signup bonus, granted atomically during user creation. Set to 0 to disable.
export const WELCOME_BONUS_AMOUNT = envInt('CREDITS_WELCOME_BONUS', 10);

// Cost per unit of work. Single and bulk charge the same rate for a given action.
// Volume discounts live in the credit packs (app/utils/pricing.js), never here.
// Floor note: 1 credit is worth $0.0063 at the deepest pack. Phone at 2 credits
// clears Twilio cost (~$0.005) with room. Any pack rate below $0.005 per credit
// requires moving phone_verify to 3 credits in the same change.
export const CREDIT_COSTS = {
  email_score:                envInt('CREDITS_COST_EMAIL_SCORE', 1),
  email_verify:               envInt('CREDITS_COST_EMAIL_VERIFY', 1),
  phone_verify:               envInt('CREDITS_COST_PHONE_VERIFY', 2),
  phone_verify_bulk_per_call: envInt('CREDITS_COST_PHONE_VERIFY_BULK_PER_CALL', 2),
  domain_check:               envInt('CREDITS_COST_DOMAIN_CHECK', 0),
  smtp_test:                  envInt('CREDITS_COST_SMTP_TEST', 0),
  dns_generate:               envInt('CREDITS_COST_DNS_GENERATE', 0),
};

// Linear. Bulk email costs the same per address as single mode.
export function bulkEmailVerifyCost(emailCount) {
  if (!Number.isInteger(emailCount) || emailCount <= 0) return 0;
  return emailCount * CREDIT_COSTS.email_verify;
}

// Linear. Twilio Lookup has no batch endpoint, so there is no volume saving to pass on.
export function bulkPhoneVerifyCost(phoneCount) {
  if (!Number.isInteger(phoneCount) || phoneCount <= 0) return 0;
  return phoneCount * CREDIT_COSTS.phone_verify_bulk_per_call;
}

// Used by /api/jobs/:id/cancel and anything pricing a row count without knowing the type.
export function bulkCost(type, rowCount) {
  if (type === 'email') return bulkEmailVerifyCost(rowCount);
  if (type === 'phone') return bulkPhoneVerifyCost(rowCount);
  throw new Error(`bulkCost: unknown type "${type}"`);
}

// Low-balance threshold for the dashboard banner.
export const LOW_BALANCE_THRESHOLD = envInt('CREDITS_LOW_BALANCE_THRESHOLD', 100);

// Hard ceiling on bulk job sizes, enforced by the route before credits are spent.
export const BULK_EMAIL_MAX_ROWS = envInt('BULK_EMAIL_MAX_ROWS', 50_000);
export const BULK_PHONE_MAX_ROWS = envInt('BULK_PHONE_MAX_ROWS', 10_000);

// Grants track expiry per row via expires_at + remaining_amount. Set to 0 to disable.
export const CREDIT_EXPIRY_MONTHS = envInt('CREDITS_EXPIRY_MONTHS', 12);
