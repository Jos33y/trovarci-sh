// Side-rail form that issues a Sender license to the user being viewed.
import { Form } from 'react-router';
import { KeyIcon } from '~/components/icons';
import styles from '~/styles/modules/admin/licenses/License.module.css';

export default function IssueLicenseForm({ email, issueToken, defaultDevices, maxDevices, errors = {}, busy = false, self = false }) {
  return (
    <Form method="post" className={styles.issueForm}>
      <input type="hidden" name="intent" value="license_issue" />
      <input type="hidden" name="issueToken" value={issueToken} />

      <p className={styles.issueOwner}>
        <span className={styles.issueOwnerLabel}>Owner</span>
        <span className={styles.issueOwnerEmail}>{email}</span>
        {self ? <span className={styles.issueSelf}>Your own account. Logged as self-issued.</span> : null}
      </p>

      <div className={styles.issueField}>
        <label className={styles.issueLabel} htmlFor="maxDevices">Devices allowed</label>
        <input
          id="maxDevices"
          name="maxDevices"
          type="number"
          min="1"
          max={maxDevices}
          defaultValue={defaultDevices}
          required
          className={styles.issueInput}
        />
        {errors.maxDevices ? <p className={styles.issueError} role="alert">{errors.maxDevices}</p> : null}
      </div>

      <div className={styles.issueField}>
        <label className={styles.issueLabel} htmlFor="paymentReference">Payment reference</label>
        <input
          id="paymentReference"
          name="paymentReference"
          maxLength={200}
          autoComplete="off"
          placeholder="Optional, e.g. a Stripe charge id"
          className={styles.issueInput}
        />
        {errors.paymentReference ? <p className={styles.issueError} role="alert">{errors.paymentReference}</p> : null}
      </div>

      <div className={styles.issueField}>
        <label className={styles.issueLabel} htmlFor="issueReason">Reason</label>
        <textarea
          id="issueReason"
          name="reason"
          required
          minLength={5}
          maxLength={500}
          placeholder="5 to 500 characters. Audit logged."
          className={styles.issueTextarea}
        />
        {errors.reason ? <p className={styles.issueError} role="alert">{errors.reason}</p> : null}
      </div>

      {errors._form ? <p className={styles.issueError} role="alert">{errors._form}</p> : null}

      <button type="submit" className={styles.issueButton} disabled={busy}>
        <KeyIcon size={16} />
        <span>{busy ? 'Signing key' : 'Issue license'}</span>
      </button>
      <p className={styles.issueNote}>
        The key is signed on this server. It shows on the license card and stays retrievable here.
      </p>
    </Form>
  );
}
