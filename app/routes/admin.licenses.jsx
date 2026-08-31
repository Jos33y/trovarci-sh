// Admin licenses - issue a sender license against a verified payment, list and revoke.
import { Form, useLoaderData, useActionData, useNavigation, data, redirect } from 'react-router';
import { requireAdmin, adminListLicenses, adminFindUserByEmail } from '~/utils/admin.server';
import { logAdminAction } from '~/utils/adminActions.server';
import { issueLicense, revokeLicense } from '~/lib/licenses.server';
import { sendLicenseKeyEmail } from '~/utils/email.server';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin';

export const meta = () => [
  { title: 'Licenses | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOWNLOAD_URL = 'https://trovarci.sh/download';

const STATUS_BADGE = { active: 'badgeSuccess', revoked: 'badgeError' };

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export async function loader({ request }) {
  await requireAdmin(request);
  return { licenses: await adminListLicenses({ limit: 100 }) };
}

export async function action({ request }) {
  const admin = await requireAdmin(request);

  const form = await request.formData();
  const intent = String(form.get('intent') || '');

  if (intent === 'revoke') {
    const licenseId = String(form.get('licenseId') || '');
    const reason = String(form.get('reason') || '').trim();

    if (!UUID_RE.test(licenseId)) {
      return data({ errors: { _form: 'Invalid license id' } }, { status: 400 });
    }
    if (reason.length < 5 || reason.length > 500) {
      return data({ errors: { revokeReason: 'Reason must be 5-500 characters' } }, { status: 400 });
    }

    const result = await revokeLicense({ licenseId, reason });
    if (!result.ok) {
      return data({ errors: { _form: 'That license is not active' } }, { status: 400 });
    }

    await logAdminAction(null, {
      actorId: admin.id,
      actionType: 'license_revoke',
      targetUserId: result.license.userId,
      targetKind: 'license',
      reason,
      context: { license_id: licenseId },
    });

    return redirect('/admin/licenses?revoked=ok');
  }

  if (intent !== 'issue') {
    return data({ errors: { _form: 'Unknown action' } }, { status: 400 });
  }

  const email = String(form.get('email') || '').trim();
  const paymentReference = String(form.get('paymentReference') || '').trim();
  const maxDevices = parseInt(String(form.get('maxDevices') || '3'), 10);

  if (!EMAIL_RE.test(email)) {
    return data({ errors: { email: 'Enter a valid email' } }, { status: 400 });
  }
  if (paymentReference.length < 4 || paymentReference.length > 200) {
    return data({ errors: { paymentReference: 'Record how the payment was verified (4-200 characters)' } }, { status: 400 });
  }
  if (!Number.isFinite(maxDevices) || maxDevices < 1 || maxDevices > 50) {
    return data({ errors: { maxDevices: 'Devices must be between 1 and 50' } }, { status: 400 });
  }

  const user = await adminFindUserByEmail(email);
  if (!user) {
    return data({ errors: { email: 'No active account with that email. They must register first.' } }, { status: 400 });
  }
  if (!user.email_verified_at) {
    return data({ errors: { email: 'That account has not verified its email yet' } }, { status: 400 });
  }

  const license = await issueLicense({
    userId: user.id,
    entitlements: ['sender'],
    maxDevices,
    paymentReference,
    issuedBy: admin.id,
  });

  // Logged after issuance so the audit trail cannot claim a license that failed to write.
  await logAdminAction(null, {
    actorId: admin.id,
    actionType: 'license_issue',
    targetUserId: user.id,
    targetKind: 'license',
    reason: paymentReference,
    context: {
      license_id: license.id,
      max_devices: maxDevices,
      entitlements: license.entitlements,
    },
  });

  // The license exists whether or not the email lands. The key is in the admin list
  // and in the customer's dashboard, so a send failure is recoverable by hand.
  let emailed = 'ok';
  try {
    await sendLicenseKeyEmail({
      to: user.email,
      licenseId: license.id,
      licenseKey: license.licenseKey,
      maxDevices,
      downloadUrl: DOWNLOAD_URL,
    });
  } catch (err) {
    console.error('[admin licenses] key email failed:', err?.message || err);
    emailed = 'failed';
  }

  return redirect(`/admin/licenses?issued=${emailed}`);
}

export default function AdminLicenses() {
  const { licenses } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Licenses</h1>
          <p className={styles.pageSubtitle}>Sender licenses, issued by hand against a verified payment</p>
        </div>
      </header>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Issue a license</h2>

        <Form method="post" className={styles.actionForm}>
          <input type="hidden" name="intent" value="issue" />

          <label className={styles.formLabel} htmlFor="license-email">Customer email</label>
          <input
            id="license-email"
            name="email"
            type="email"
            className={styles.formInput}
            placeholder="buyer@example.com"
            required
          />
          {actionData?.errors?.email && <div className={styles.formError}>{actionData.errors.email}</div>}

          <label className={styles.formLabel} htmlFor="license-payment">Payment reference</label>
          <input
            id="license-payment"
            name="paymentReference"
            type="text"
            className={styles.formInput}
            placeholder="Bank transfer 27 Aug, ref TRV-0001"
            required
          />
          {actionData?.errors?.paymentReference && <div className={styles.formError}>{actionData.errors.paymentReference}</div>}

          <label className={styles.formLabel} htmlFor="license-devices">Devices</label>
          <input
            id="license-devices"
            name="maxDevices"
            type="number"
            min="1"
            max="50"
            defaultValue="3"
            className={styles.formInput}
          />
          {actionData?.errors?.maxDevices && <div className={styles.formError}>{actionData.errors.maxDevices}</div>}

          {actionData?.errors?._form && <div className={styles.formError}>{actionData.errors._form}</div>}

          <button type="submit" className={styles.formButton} disabled={submitting}>
            {submitting ? 'Issuing' : 'Issue and email key'}
          </button>
        </Form>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>All licenses</h2>

        {licenses.length === 0 ? (
          <EmptyState title="No licenses yet" hint="Issue one above once a payment is verified" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>License</th>
                <th>Devices</th>
                <th>Payment</th>
                <th>Issued</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => (
                <tr key={l.id}>
                  <td>{l.email}</td>
                  <td className={styles.mono}>{l.id.slice(0, 8).toUpperCase()}</td>
                  <td className={styles.mono}>{l.live_devices} of {l.max_devices}</td>
                  <td>{l.payment_reference || '-'}</td>
                  <td className={styles.mono}>{formatDate(l.issued_at)}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[STATUS_BADGE[l.status]]}`}>{l.status}</span>
                  </td>
                  <td>
                    {l.status === 'active' && (
                      <Form method="post" className={styles.inlineForm}>
                        <input type="hidden" name="intent" value="revoke" />
                        <input type="hidden" name="licenseId" value={l.id} />
                        <input
                          name="reason"
                          type="text"
                          className={styles.formInputInline}
                          placeholder="Reason"
                          required
                        />
                        <button type="submit" className={styles.formButtonDanger} disabled={submitting}>
                          Revoke
                        </button>
                      </Form>
                    )}
                    {l.status === 'revoked' && <span className={styles.muted}>{l.revoked_reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {actionData?.errors?.revokeReason && <div className={styles.formError}>{actionData.errors.revokeReason}</div>}
      </section>
    </>
  );
}
