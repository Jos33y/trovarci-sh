// Trovarcis Sender pricing and sale settings. The server decides every price; a form only names one.

function centsEnv(key, fallback) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${key} must be a positive whole number of cents, got: ${raw}`);
  return n;
}

export const SENDER_LIST_CENTS = centsEnv('SENDER_LIST_PRICE_CENTS', 9900);
export const SENDER_LAUNCH_CENTS = centsEnv('SENDER_LAUNCH_PRICE_CENTS', 7900);
export const SENDER_TEST_CENTS = centsEnv('SENDER_TEST_PRICE_CENTS', 200);
export const SENDER_MAX_DEVICES = 3;

// SENDER_LAUNCH_ENDS is a date (YYYY-MM-DD). Unset means the launch price has no end date yet.
function launchEnd() {
  const raw = process.env.SENDER_LAUNCH_ENDS;
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`SENDER_LAUNCH_ENDS must be YYYY-MM-DD, got: ${raw}`);
  return new Date(`${raw}T23:59:59Z`);
}

export function currentSenderPrice(now = new Date()) {
  const ends = launchEnd();
  const launch = SENDER_LAUNCH_CENTS < SENDER_LIST_CENTS && (!ends || now <= ends);
  return {
    key: launch ? 'launch' : 'list',
    cents: launch ? SENDER_LAUNCH_CENTS : SENDER_LIST_CENTS,
    listCents: SENDER_LIST_CENTS,
    launchEndsAt: launch && ends ? ends.toISOString().slice(0, 10) : null,
  };
}

// The test price is only offered to an admin, for the end-to-end check before going live.
export function priceForKey(key, { isAdmin = false } = {}) {
  if (key === 'test') return isAdmin ? { key: 'test', cents: SENDER_TEST_CENTS } : null;
  const current = currentSenderPrice();
  return key === current.key ? { key: current.key, cents: current.cents } : null;
}

// Crypto buyers often have to buy coin first, so a license invoice stays open longer than a
// Credits one. Cryptomus allows 300 to 43200 seconds.
export const LICENSE_INVOICE_LIFETIME_SEC = Math.min(
  43200,
  Math.max(300, parseInt(process.env.CRYPTOMUS_LICENSE_INVOICE_LIFETIME_SEC || '43200', 10) || 43200),
);

// Polar has one product per price, priced to match: POLAR_PRODUCT_SENDER_LAUNCH, _LIST, _TEST.
export function getPolarSenderProductId(priceKey) {
  return process.env[`POLAR_PRODUCT_SENDER_${String(priceKey).toUpperCase()}`] || null;
}
