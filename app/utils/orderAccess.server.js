// The buyer's browser proves it owns an order with a token in a cookie, so a guest can see their
// key on the order page without an account. The database keeps only the token's hash.

const COOKIE = 'trov_orders';
const MAX_ORDERS = 5;
const MAX_AGE_SEC = 60 * 60 * 24 * 90;
const ENTRY_RE = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i;

function readEntries(request) {
  const header = request.headers.get('cookie') || '';
  const raw = header.split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`));
  if (!raw) return [];
  return decodeURIComponent(raw.slice(COOKIE.length + 1))
    .split('~')
    .map((entry) => entry.match(ENTRY_RE))
    .filter(Boolean)
    .map((m) => ({ orderId: m[1].toLowerCase(), token: m[2] }));
}

export function readOrderTokens(request) {
  return readEntries(request).map((e) => e.token);
}

export function orderTokenCookie(request, orderId, token) {
  const entries = [{ orderId, token }, ...readEntries(request).filter((e) => e.orderId !== orderId)].slice(0, MAX_ORDERS);
  const value = encodeURIComponent(entries.map((e) => `${e.orderId}.${e.token}`).join('~'));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  // Lax so the cookie comes along when the gateway sends the buyer back to the order page.
  return `${COOKIE}=${value}; Path=/sender/order; Max-Age=${MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`;
}
