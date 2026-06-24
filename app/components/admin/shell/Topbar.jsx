// Mobile-only top bar - brand + hamburger. Hidden on desktop (sidebar carries identity).
import { Link } from 'react-router';
import { TrovarcisAdminLogo } from '~/components/shared/Logo';
import styles from '~/styles/modules/admin/shell/Topbar.module.css';

export default function Topbar({ open, onToggle }) {
  return (
    <header className={styles.topbar}>
      <Link to="/admin" className={styles.brand} aria-label="Trovarcis Admin home">
        <TrovarcisAdminLogo size={24} />
      </Link>
      <button
        type="button"
        className={styles.hamburger}
        onClick={onToggle}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open
            ? <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            : <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
        </svg>
      </button>
    </header>
  );
}
