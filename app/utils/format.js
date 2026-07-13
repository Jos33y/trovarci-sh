// Deterministic date and number formatters. All output is byte-identical on Node and any browser
// (no ICU dependency). Use these instead of toLocaleString to avoid React #418 hydration errors.

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Format YYYY-MM-DD string into "March 15, 2026".
export function formatDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${MONTHS_LONG[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

// Format YYYY-MM-DD string into "Mar 15, 2026".
export function formatDateShort(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${MONTHS_SHORT[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

// Format Date/timestamp/ISO string into "March 15, 2026 at 5:30 PM UTC".
export function formatDateLong(input) {
  const d = new Date(input);
  const month = MONTHS_LONG[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm} UTC`;
}

// Format Date/timestamp/ISO string into ISO YYYY-MM-DD.
export function formatDateIso(input) {
  return new Date(input).toISOString().slice(0, 10);
}

// Format integer with en-US thousand separators (10000 -> "10,000"). Non-numeric returns "0".
export function formatInt(n) {
  if (!Number.isFinite(Number(n))) return '0';
  return String(Math.trunc(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
