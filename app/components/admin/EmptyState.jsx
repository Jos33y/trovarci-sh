// Empty state inside cards and panels. Pass `icon` to override the variant SVG.
import styles from '~/styles/modules/admin/EmptyState.module.css';

export default function EmptyState({ title, body, action, variant = 'data', icon: Icon }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.markWrap} aria-hidden="true">
        {Icon ? (
          <Icon size={28} />
        ) : (
          <svg viewBox="0 0 64 64" width="48" height="48" fill="none" className={styles.mark}>
            {variant === 'search' ? (
              <>
                <circle cx="26" cy="26" r="14" stroke="currentColor" strokeWidth="2" />
                <path d="M37 37L48 48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 26H31" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
              </>
            ) : variant === 'error' ? (
              <>
                <path d="M32 6L58 52H6L32 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M32 24V36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="32" cy="44" r="2" fill="currentColor" />
              </>
            ) : (
              <>
                <rect x="10" y="14" width="44" height="36" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M10 24H54" stroke="currentColor" strokeWidth="2" strokeOpacity="0.5" />
                <path d="M18 32H38M18 38H32M18 44H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
              </>
            )}
          </svg>
        )}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
