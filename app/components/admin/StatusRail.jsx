import styles from '~/styles/modules/admin/StatusRail.module.css';

const SERVICES = [
  { key: 'postgres',  label: 'Postgres'  },
  { key: 'resend',    label: 'Resend'    },
  { key: 'cryptomus', label: 'Cryptomus' },
  { key: 'stripe',    label: 'Stripe'    },
  { key: 'worker',    label: 'Worker'    },
];

/**
 * Top-of-admin health rail. Five service pills with a dot + label.
 *
 * Status values:
 *   ok    - green dot
 *   warn  - amber dot
 *   down  - red dot, dominates the eye
 *
 * Postgres reports real ping latency from the loader (cheap SELECT 1).
 * Resend / Cryptomus / Stripe / Worker are V2 - the loader returns 'ok'
 * placeholders today; the real probes will land in batch G3 when the
 * heartbeat tables ship. The UI is forward-compatible.
 *
 * @param {object} status
 *   { postgres: {status, latency_ms?}, resend: {status}, ... }
 */
export default function StatusRail({ status }) {
  if (!status) return null;

  return (
    <div className={styles.rail} role="status" aria-label="System status">
      {SERVICES.map(({ key, label }) => {
        const svc = status[key] || { status: 'unknown' };
        const tone = svc.status === 'ok'   ? 'ok'
                   : svc.status === 'warn' ? 'warn'
                   : svc.status === 'down' ? 'down'
                   : 'unknown';

        const meta = key === 'postgres' && Number.isFinite(svc.latency_ms)
          ? `${svc.latency_ms}ms`
          : null;

        return (
          <span key={key} className={`${styles.pill} ${styles[`tone_${tone}`]}`}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
            {meta ? <span className={styles.meta}>{meta}</span> : null}
          </span>
        );
      })}
    </div>
  );
}
