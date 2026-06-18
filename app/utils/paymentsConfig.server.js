/**
 * Payments configuration.
 *
 * Credit packages, gateway feature flags, and env-sourced credentials.
 * Package definitions are the source of truth for pricing; never trust
 * client-submitted prices in the checkout action.
 */

function requireEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is required`);
  return v;
}

function optionalEnv(key, fallback = null) {
  return process.env[key] || fallback;
}

function envFlag(key, defaultValue = false) {
  const v = process.env[key];
  if (v === undefined) return defaultValue;
  return v === 'true' || v === '1';
}

// -----------------------------------------------------------------------
// Credit packages - the ONLY source of truth for pricing
//
// Flat rate: $0.010 per credit across every package and the custom
// amount. Presets exist as one-click pickers for common amounts, NOT
// as a price-discrimination grid. The same per-credit price applies
// everywhere; volume discounts (when offered) come via promo codes,
// not by gating the rate behind tier names.
// -----------------------------------------------------------------------

export const CREDIT_PACKAGES = [
  { key: 'starter', name: 'Starter',  credits: 500,    priceUsdCents: 500,    pricePerCredit: 0.010 },
  { key: 'growth',  name: 'Growth',   credits: 2500,   priceUsdCents: 2500,   pricePerCredit: 0.010, popular: true },
  { key: 'pro',     name: 'Pro',      credits: 10000,  priceUsdCents: 10000,  pricePerCredit: 0.010 },
];

export function getPackage(key) {
  return CREDIT_PACKAGES.find((p) => p.key === key) || null;
}

// -----------------------------------------------------------------------
// Custom amount configuration
//
// Users can buy any integer credit amount between MIN and MAX at the
// CUSTOM_PRICE_PER_CREDIT rate. Same flat $0.010/credit as the presets;
// custom is for users who know exactly how many they want, not a
// pricing tier. Volume discounts come via promo codes, never via
// hidden custom-vs-package price differences.
//
// All values env-overridable so you can tune at the admin layer later.
// -----------------------------------------------------------------------

function envInt(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${key} must be a positive integer, got: ${v}`);
  }
  return n;
}

function envFloat(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${key} must be a positive number, got: ${v}`);
  }
  return n;
}

export const CUSTOM_MIN_CREDITS       = envInt('CREDITS_CUSTOM_MIN', 100);      // min $1.00 at default rate
export const CUSTOM_MAX_CREDITS       = envInt('CREDITS_CUSTOM_MAX', 50000);    // max $500 at default rate
export const CUSTOM_PRICE_PER_CREDIT  = envFloat('CREDITS_CUSTOM_PRICE_PER_CREDIT', 0.010);

/**
 * Synthesize a package object for a user-supplied custom credits amount.
 * Returns null if the amount is out of bounds or not an integer.
 *
 * Prices are rounded UP to the nearest cent so we never charge under cost.
 */
export function buildCustomPackage(creditsRequested) {
  const credits = Number(creditsRequested);
  if (!Number.isInteger(credits)) return null;
  if (credits < CUSTOM_MIN_CREDITS || credits > CUSTOM_MAX_CREDITS) return null;

  const priceUsdCents = Math.ceil(credits * CUSTOM_PRICE_PER_CREDIT * 100);

  return {
    key: 'custom',
    name: 'Custom',
    credits,
    priceUsdCents,
    pricePerCredit: CUSTOM_PRICE_PER_CREDIT,
  };
}

// -----------------------------------------------------------------------
// Gateway availability
// -----------------------------------------------------------------------

export const CRYPTOMUS_ENABLED = envFlag('CRYPTOMUS_ENABLED', true);
export const STRIPE_ENABLED    = envFlag('STRIPE_ENABLED', false);

// -----------------------------------------------------------------------
// Cryptomus configuration
// -----------------------------------------------------------------------

export const CRYPTOMUS_API_BASE = optionalEnv('CRYPTOMUS_API_BASE', 'https://api.cryptomus.com/v1');

export function getCryptomusCredentials() {
  return {
    merchantUuid:   requireEnv('CRYPTOMUS_MERCHANT_UUID'),
    paymentApiKey:  requireEnv('CRYPTOMUS_PAYMENT_API_KEY'),
  };
}

export function getPublicUrl() {
  const url = requireEnv('PUBLIC_APP_URL');
  return url.replace(/\/+$/, '');
}

export const CRYPTOMUS_INVOICE_LIFETIME_SEC = parseInt(
  process.env.CRYPTOMUS_INVOICE_LIFETIME_SEC || '3600',
  10,
);

// -----------------------------------------------------------------------
// Stripe configuration
//
// Stripe credentials are required only when STRIPE_ENABLED=true. When the
// flag is off the requireEnv() calls in getStripeCredentials() never fire,
// so a deployment can keep STRIPE_SECRET_KEY unset until paperwork lands.
//
// STRIPE_API_BASE override exists so tests can point at a localhost mock.
// In production it stays the canonical Stripe endpoint.
// -----------------------------------------------------------------------

export const STRIPE_API_BASE = optionalEnv('STRIPE_API_BASE', 'https://api.stripe.com');

export function getStripeCredentials() {
  return {
    secretKey:      requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret:  requireEnv('STRIPE_WEBHOOK_SECRET'),
  };
}

/**
 * Replay-window tolerance for Stripe webhook signatures (seconds). Default
 * matches Stripe's own SDK default. Tighten only if you have a
 * specific reason and tight clock sync between Stripe and the app server.
 */
export const STRIPE_WEBHOOK_TOLERANCE_SEC = (() => {
  const raw = process.env.STRIPE_WEBHOOK_TOLERANCE_SEC;
  if (!raw) return 300;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 300;
  return n;
})();
