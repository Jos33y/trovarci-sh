// Sender lines that must read the same everywhere they appear.

export const STORAGE_LINE = 'Your lists and your SMTP credentials are stored locally. Trovarcis never sees them.';

export const SENDER_REFUND_LINE = '15-day refund if it doesn’t work for you.';

export const CREDIT_REFUND_LINE = 'Unused Credits bought in the last 7 days can be refunded to your original payment. Credits already used are not refundable. If a check fails on our side, its Credits go back to your balance automatically.';

// Whole dollars when the price is whole: $79, not $79.00.
export function formatSenderPrice(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
