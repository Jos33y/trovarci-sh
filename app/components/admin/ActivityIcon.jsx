import styles from '~/styles/modules/admin/ActivityIcon.module.css';

/**
 * Small custom SVG icon for the LiveFeed kind discriminator. Hand-built,
 * 16×16 viewBox, currentColor inheritance. The wrapping circle background
 * tints based on `kind` so the eye picks out severity at a glance.
 *
 * @param {object} props
 * @param {'signup'|'payment'|'error'|'admin_action'} props.kind
 * @param {number} [props.size=28]
 */
export default function ActivityIcon({ kind, size = 28 }) {
  const tone = kind === 'error' ? 'error'
            : kind === 'payment' ? 'accent'
            : kind === 'admin_action' ? 'warning'
            : 'success';

  return (
    <span
      className={`${styles.bubble} ${styles[`tone_${tone}`]}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        {kind === 'signup' ? (
          /* user-plus mark */
          <>
            <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 13.5C2 11 4 9.5 6 9.5C7.4 9.5 8.6 10.2 9.3 11.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 9.5V13.5M10 11.5H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : kind === 'payment' ? (
          /* dollar disc */
          <>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5V11.5M10 6.2C9.5 5.6 8.8 5.2 8 5.2C6.9 5.2 6 5.9 6 6.8C6 7.7 6.9 8 8 8C9.1 8 10 8.4 10 9.3C10 10.2 9.1 10.8 8 10.8C7 10.8 6.3 10.5 5.8 9.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : kind === 'error' ? (
          /* alert triangle */
          <>
            <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.3" r="0.8" fill="currentColor" />
          </>
        ) : (
          /* admin action - shield with check */
          <>
            <path d="M8 1.5L2.5 3.5V8C2.5 11 5 13.5 8 14.5C11 13.5 13.5 11 13.5 8V3.5L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M5.5 8L7.2 9.7L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </span>
  );
}
