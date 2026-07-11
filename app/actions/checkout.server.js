// POST /credits - resolve package server-side, create pending payment, redirect to hosted gateway checkout.

import { redirect, data } from 'react-router';
import { requireUser } from '~/utils/session.server';
import {
  createPendingPayment,
  markAwaitingPayment,
  markPaymentFailed,
} from '~/lib/payments.server';
import { createInvoice } from '~/lib/cryptomus.server';
import { createCheckoutSession } from '~/lib/stripe.server';
import {
  getPackage,
  buildCustomPackage,
  CUSTOM_MIN_CREDITS,
  CUSTOM_MAX_CREDITS,
  CRYPTOMUS_ENABLED,
  STRIPE_ENABLED,
} from '~/utils/paymentsConfig.server';
import { recordEvent, buildEventFromRequest } from '~/utils/analytics.server';

// Fire payment_failed with code. Never throws.
function recordCheckoutError(request, userId, code, extra = {}) {
  try {
    recordEvent(buildEventFromRequest(request, {
      eventType: 'payment_failed',
      path: '/credits',
      userId: userId ?? null,
      metadata: { stage: 'checkout', code, ...extra },
    }));
  } catch { /* analytics failure must not block checkout */ }
}

export async function checkoutAction({ request }) {
  const user = await requireUser(request);
  const form = await request.formData();

  const packageKey    = String(form.get('packageKey') || '');
  const creditsAmount = form.get('creditsAmount');
  const gateway       = String(form.get('gateway') || 'cryptomus');

  let pkg;
  if (packageKey === 'custom') {
    const parsed = parseInt(String(creditsAmount || ''), 10);
    if (!Number.isFinite(parsed)) {
      recordCheckoutError(request, user.id, 'INVALID_AMOUNT', { gateway });
      return data({ errors: { creditsAmount: 'Enter a credit amount' } }, { status: 400 });
    }
    pkg = buildCustomPackage(parsed);
    if (!pkg) {
      recordCheckoutError(request, user.id, 'CUSTOM_OUT_OF_RANGE', { gateway, requested: parsed });
      return data(
        {
          errors: {
            creditsAmount: `Custom amount must be between ${CUSTOM_MIN_CREDITS.toLocaleString()} and ${CUSTOM_MAX_CREDITS.toLocaleString()} credits`,
          },
        },
        { status: 400 },
      );
    }
  } else {
    pkg = getPackage(packageKey);
    if (!pkg) {
      recordCheckoutError(request, user.id, 'INVALID_PACKAGE', { gateway, package_key: packageKey });
      return data({ errors: { _form: 'Select a package' } }, { status: 400 });
    }
  }

  if (gateway === 'cryptomus' && !CRYPTOMUS_ENABLED) {
    recordCheckoutError(request, user.id, 'CRYPTOMUS_DISABLED', { package_key: pkg.key });
    return data({ errors: { _form: 'Cryptomus is not currently available' } }, { status: 503 });
  }
  if (gateway === 'stripe' && !STRIPE_ENABLED) {
    recordCheckoutError(request, user.id, 'STRIPE_DISABLED', { package_key: pkg.key });
    return data({ errors: { _form: 'Card payments are not yet available. Use crypto.' } }, { status: 503 });
  }
  if (gateway !== 'cryptomus' && gateway !== 'stripe') {
    recordCheckoutError(request, user.id, 'UNKNOWN_GATEWAY', { gateway });
    return data({ errors: { _form: 'Unknown payment method' } }, { status: 400 });
  }

  recordEvent(buildEventFromRequest(request, {
    eventType: 'checkout_click',
    path: '/credits',
    userId: user.id,
    metadata: {
      gateway,
      package_key: pkg.key,
      credits: pkg.credits,
      amount_usd_cents: pkg.priceUsdCents,
    },
  }));

  const payment = await createPendingPayment({
    userId: user.id,
    gateway,
    packageKey: pkg.key,
    credits: pkg.credits,
    amountUsdCents: pkg.priceUsdCents,
    metadata: {
      package_name: pkg.name,
      user_email: user.email,
      ...(pkg.key === 'custom' ? { custom_credits: pkg.credits } : {}),
    },
  });

  // Fire payment_pending BEFORE the gateway redirect so we capture intent even
  // if the redirect fails or the user closes the tab during gateway handoff.
  recordEvent(buildEventFromRequest(request, {
    eventType: 'payment_pending',
    path: '/credits',
    userId: user.id,
    metadata: {
      gateway,
      payment_id: payment.id,
      package_key: pkg.key,
      amount_usd_cents: pkg.priceUsdCents,
    },
  }));

  try {
    if (gateway === 'cryptomus') {
      const amountUsd = (pkg.priceUsdCents / 100).toFixed(2);
      const invoice = await createInvoice({
        orderId: payment.id,
        amountUsd,
        customerEmail: user.email,
      });

      const updated = await markAwaitingPayment(payment.id, {
        gatewayReference: invoice.uuid,
        checkoutUrl: invoice.url,
      });

      if (!updated) {
        throw new Error('Payment row state changed unexpectedly');
      }

      recordEvent(buildEventFromRequest(request, {
        eventType: 'gateway_redirect',
        path: '/credits',
        userId: user.id,
        metadata: { gateway, payment_id: payment.id, package_key: pkg.key },
      }));

      throw redirect(invoice.url);
    }

    if (gateway === 'stripe') {
      const session = await createCheckoutSession({
        paymentId: payment.id,
        amountUsdCents: pkg.priceUsdCents,
        credits: pkg.credits,
        packageKey: pkg.key,
        packageName: pkg.name,
        customerEmail: user.email,
      });

      const updated = await markAwaitingPayment(payment.id, {
        gatewayReference: session.id,
        checkoutUrl: session.url,
      });

      if (!updated) {
        throw new Error('Payment row state changed unexpectedly');
      }

      recordEvent(buildEventFromRequest(request, {
        eventType: 'gateway_redirect',
        path: '/credits',
        userId: user.id,
        metadata: { gateway, payment_id: payment.id, package_key: pkg.key },
      }));

      throw redirect(session.url);
    }

    throw new Error(`Unknown gateway: ${gateway}`);

  } catch (err) {
    if (err instanceof Response) throw err;

    console.error('[checkout] gateway call failed:', err);
    await markPaymentFailed(payment.id, err.message?.slice(0, 500) || 'gateway_error');

    recordCheckoutError(request, user.id, 'GATEWAY_ERROR', {
      gateway,
      payment_id: payment.id,
      package_key: pkg.key,
    });

    return data(
      { errors: { _form: 'Could not start checkout. Try again or contact support.' } },
      { status: 502 },
    );
  }
}
