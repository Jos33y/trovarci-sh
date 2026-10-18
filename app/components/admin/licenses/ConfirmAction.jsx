// Two-step admin action: a quiet trigger that opens a reasoned confirm form in place.
import { useEffect, useState } from 'react';
import { Form } from 'react-router';
import styles from '~/styles/modules/admin/licenses/License.module.css';

export default function ConfirmAction({
  intent,
  fields = {},
  label,
  confirmLabel,
  prompt,
  danger = false,
  busy = false,
  error = null,
}) {
  const [open, setOpen] = useState(Boolean(error));

  useEffect(() => {
    if (error) setOpen(true);
  }, [error]);

  if (!open) {
    return (
      <button
        type="button"
        className={`${styles.trigger} ${danger ? styles.triggerDanger : ''}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  const reasonId = `reason-${intent}-${Object.values(fields).join('-')}`;

  return (
    <Form method="post" className={`${styles.confirm} ${danger ? styles.confirmDanger : ''}`}>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className={styles.confirmPrompt} htmlFor={reasonId}>{prompt}</label>
      <input
        id={reasonId}
        name="reason"
        required
        minLength={5}
        maxLength={500}
        autoFocus
        autoComplete="off"
        placeholder="Reason, 5 to 500 characters. Audit logged."
        className={styles.confirmInput}
      />
      {error ? <p className={styles.confirmError} role="alert">{error}</p> : null}
      <div className={styles.confirmActions}>
        <button
          type="submit"
          className={danger ? styles.confirmGoDanger : styles.confirmGo}
          disabled={busy}
        >
          {busy ? 'Working' : confirmLabel}
        </button>
        <button type="button" className={styles.confirmCancel} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </Form>
  );
}
