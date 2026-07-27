// Payments configuration. Credit packs, gateway flags, and env-sourced credentials.

import {
  CREDIT_PACKAGES,
  PACKAGE_KEYS,
  getPackage as getPackageFromCurve,
  customPriceCents,
} from './pricing.js';

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

function envInt(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${key} must be a positive integer, got: ${v}`);
  }
  return n;
}

// Packs are the source of truth for pricing. Never trust a client-submitted price.
// The table lives in pricing.js because the credits page renders from the same data.
export { CREDIT_PACKAGES, PACKAGE_KEYS };

export function getPackage(key) {
  return getPackageFromCurve(key);
}

// Custom amounts pay the same flat rate as the packs. Packs are one-click pickers
// for common amounts, not a price-discrimination grid.
export const CUSTOM_MIN_CREDITS = envInt('CREDITS_CUSTOM_MIN', 100);
export const CUSTOM_MAX_CREDITS = envInt('CREDITS_CUSTOM_MAX', 1_000_000);

export function buildCustomPackage(creditsRequested) {
  const credits = Number(creditsRequested);
  if (!Number.isInteger(credits)) return null;
  if (credits < CUSTOM_MIN_CREDITS || credits > CUSTOM_MAX_CREDITS) return null;

  const priceUsdCents = customPriceCents(credits);
  if (priceUsdCents <= 0) return null;

  return {
    key: 'custom',
    name: 'Custom',
    credits,
    priceUsdCents,
    pricePerCredit: priceUsdCents / 100 / credits,
  };
}

// Gateway availability
export const CRYPTOMUS_ENABLED = envFlag('CRYPTOMUS_ENABLED', true);
export const STRIPE_ENABLED    = envFlag('STRIPE_ENABLED', false);

// Cryptomus configuration
export const CRYPTOMUS_API_BASE = optionalEnv('CRYPTOMUS_API_BASE', 'https://api.cryptomus.com/v1');

export function getCryptomusCredentials() {
  return {
    merchantUuid:  requireEnv('CRYPTOMUS_MERCHANT_UUID'),
    paymentApiKey: requireEnv('CRYPTOMUS_PAYMENT_API_KEY'),
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

// Stripe configuration. Credentials are read only when STRIPE_ENABLED=true, so a
// deployment can leave STRIPE_SECRET_KEY unset until the paperwork lands.
export const STRIPE_API_BASE = optionalEnv('STRIPE_API_BASE', 'https://api.stripe.com');

export function getStripeCredentials() {
  return {
    secretKey:     requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
  };
}

// Replay-window tolerance for Stripe webhook signatures, in seconds.
export const STRIPE_WEBHOOK_TOLERANCE_SEC = (() => {
  const raw = process.env.STRIPE_WEBHOOK_TOLERANCE_SEC;
  if (!raw) return 300;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 300;
  return n;
})();
