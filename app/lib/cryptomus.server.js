/**
 * Cryptomus API client.
 *
 * The pure signature primitives (signBody, verifyWebhookSignature) live in
 * cryptomusSignature.server.js so they can be unit-tested under bare Node
 * (no Vite ~/ alias resolution). They are re-exported from this file so
 * any caller importing them from '~/lib/cryptomus.server' keeps working.
 *
 * Reference: https://doc.cryptomus.com/merchant-api/payments/webhook
 */

import {
  CRYPTOMUS_API_BASE,
  CRYPTOMUS_INVOICE_LIFETIME_SEC,
  getCryptomusCredentials,
  getPublicUrl,
} from '~/utils/paymentsConfig.server';
import { signBody, verifyWebhookSignature } from './cryptomusSignature.server.js';

// Re-export pure primitives for callers (the webhook route imports
// verifyWebhookSignature from here).
export { signBody, verifyWebhookSignature };

// -----------------------------------------------------------------------
// HTTP client
// -----------------------------------------------------------------------

async function cryptomusPost(path, payload) {
  const { merchantUuid, paymentApiKey } = getCryptomusCredentials();

  // Serialize ONCE. The same string goes on the wire AND into the signature.
  const bodyJson = JSON.stringify(payload);
  const sign = signBody(bodyJson, paymentApiKey);

  const url = `${CRYPTOMUS_API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'merchant': merchantUuid,
      'sign': sign,
    },
    body: bodyJson,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Cryptomus returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || data.state !== 0) {
    const msg = data?.message || data?.errors || `HTTP ${res.status}`;
    throw new Error(`Cryptomus error: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }

  return data.result;
}

// -----------------------------------------------------------------------
// Invoice creation
// -----------------------------------------------------------------------

/**
 * Create a Cryptomus invoice.
 *
 * @param {object} params
 * @param {string} params.orderId         Our payments.id (UUID as string)
 * @param {string} params.amountUsd       Amount in USD, as string (e.g. "20.00")
 * @param {string} [params.customerEmail] For our records; Cryptomus does not email
 *
 * @returns {Promise<{
 *   uuid: string,         // Cryptomus invoice UUID
 *   url: string,          // Hosted payment URL (redirect user here)
 *   orderId: string,      // Echoed back - should match what we sent
 *   expiredAt: number,    // Unix timestamp
 * }>}
 */
export async function createInvoice({ orderId, amountUsd, customerEmail }) {
  const publicUrl = getPublicUrl();

  const payload = {
    amount: String(amountUsd),
    currency: 'USD',
    order_id: orderId,
    url_callback: `${publicUrl}/api/webhooks/cryptomus`,
    url_return:   `${publicUrl}/credits`,
    url_success:  `${publicUrl}/credits/pending/${orderId}`,
    lifetime: CRYPTOMUS_INVOICE_LIFETIME_SEC,
    is_payment_multiple: false,
    ...(customerEmail ? { additional_data: JSON.stringify({ customer_email: customerEmail }) } : {}),
  };

  const result = await cryptomusPost('/payment', payload);

  return {
    uuid:      result.uuid,
    url:       result.url,
    orderId:   result.order_id,
    expiredAt: result.expired_at,
  };
}

// -----------------------------------------------------------------------
// Payment info lookup
//
// Used by /credits/pending/:paymentId to poll status when the user returns
// via url_success before the webhook has arrived.
// -----------------------------------------------------------------------

/**
 * Query Cryptomus for the current state of a payment.
 * Use either `uuid` (Cryptomus invoice id) or `orderId` (our payments.id).
 */
export async function getPaymentInfo({ uuid, orderId }) {
  if (!uuid && !orderId) {
    throw new Error('Must provide uuid or orderId');
  }
  const payload = uuid ? { uuid } : { order_id: orderId };
  return await cryptomusPost('/payment/info', payload);
}

// -----------------------------------------------------------------------
// Status mapping
//
// Cryptomus status -> our internal payment status.
// Reference: https://doc.cryptomus.com/merchant-api/payments/payment-statuses
// -----------------------------------------------------------------------

/**
 * Map Cryptomus status + is_final flag to one of our payment statuses.
 * Returns null if the status is transitional (we should not update the row).
 */
export function mapCryptomusStatus(status, isFinal) {
  switch (status) {
    case 'paid':
    case 'paid_over':
      return 'confirmed';
    case 'fail':
    case 'system_fail':
    case 'cancel':
      return 'failed';
    case 'wrong_amount':
      // Underpayment on an invoice that does not allow multiple payments.
      // Treat as failed - customer did not complete.
      return isFinal ? 'failed' : null;
    case 'refund_paid':
      return 'refunded';
    case 'confirm_check':
    case 'process':
    case 'check':
      return 'awaiting_payment';
    default:
      return null;
  }
}
