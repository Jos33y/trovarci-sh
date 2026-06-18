import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLoaderData, useLocation } from 'react-router';
import { requireAdmin, adminSystemStatus } from '~/utils/admin.server';
import StatusRail from '~/components/admin/StatusRail';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'Admin | Trovarcis Reach' },
  { name: 'robots', content: 'noindex, nofollow' },
];

/**
 * Layout-level loader. Gates every /admin/* route at the parent so we
 * never render admin chrome for non-admins. Child loaders also call
 * requireAdmin() (defence in depth and so they have the user object
 * without prop-drilling through Outlet context).
 *
 * Also runs the cheap system-status ping so the StatusRail renders
 * with real Postgres latency on every admin page (one round-trip).
 */
export async function loader({ request }) {
  const user = await requireAdmin(request);
  const systemStatus = await adminSystemStatus();
  return { user, systemStatus };
}

const NAV = [
  { to: '/admin',                   label: 'Overview',  end: true },
  { to: '/admin/users',             label: 'Users' },
  { to: '/admin/payments',          label: 'Payments' },
  { to: '/admin/jobs',              label: 'Jobs' },
  { to: '/admin/analytics',         label: 'Analytics' },
  { to: '/admin/analytics/funnel',  label: 'Funnel',  indent: true },
  { to: '/admin/analytics/journeys', label: 'Journeys', indent: true },
  { to: '/admin/errors',            label: 'Errors' },
];

export default function AdminLayout() {
  const { user, systemStatus } = useLoaderData();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-close on route change (matches Header.jsx pattern).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Body scroll lock while panel open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <div className={styles.shell}>
      {/* Mobile top bar (visible <900px) */}
      <header className={styles.mobileBar}>
        <Link to="/admin" className={styles.mobileBrand}>
          <span className={styles.brandMark}>T</span>
          <span className={styles.brandText}>Trovarcis Admin</span>
        </Link>
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {mobileOpen
              ? <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              : <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button>
      </header>

      {/* Sidebar - desktop sticky / mobile slide-in */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <Link to="/admin" className={styles.brand}>
          <span className={styles.brandMark}>T</span>
          <span className={styles.brandText}>Trovarcis Admin</span>
        </Link>

        <nav className={styles.nav} aria-label="Admin navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => {
                const cls = [styles.navLink];
                if (item.indent) cls.push(styles.navLinkIndent);
                if (isActive) cls.push(styles.navLinkActive);
                return cls.join(' ');
              }}
            >
              <span className={styles.navLinkText}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <div className={styles.sidebarUser}>
            <span className={styles.sidebarUserLabel}>Signed in as</span>
            <span className={styles.sidebarUserEmail}>{user.email}</span>
          </div>
          <Link to="/dashboard" className={styles.exitLink}>
            Exit to app
          </Link>
        </div>
      </aside>

      {/* Backdrop while mobile panel is open */}
      {mobileOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      ) : null}

      {/* Main content */}
      <main className={styles.main}>
        <StatusRail status={systemStatus} />
        <Outlet />
      </main>
    </div>
  );
}
