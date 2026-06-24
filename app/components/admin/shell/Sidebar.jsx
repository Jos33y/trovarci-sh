// Admin sidebar - grouped nav, brand head, user foot. Desktop sticky / mobile slide-in.
import { Link } from 'react-router';
import { TrovarcisAdminLogo } from '~/components/shared/Logo';
import {
  GaugeIcon, UsersIcon, CardIcon, LayersIcon, EnvelopeIcon,
  ChartIcon, FunnelIcon, RouteIcon, AlertIcon,
} from '~/components/icons';
import NavItem from './NavItem';
import styles from '~/styles/modules/admin/shell/Sidebar.module.css';

const GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Overview', icon: GaugeIcon, end: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/users',    label: 'Users',    icon: UsersIcon },
      { to: '/admin/payments', label: 'Payments', icon: CardIcon },
      { to: '/admin/jobs',     label: 'Jobs',     icon: LayersIcon },
      { to: '/admin/messages', label: 'Messages', icon: EnvelopeIcon },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/admin/analytics',          label: 'Analytics', icon: ChartIcon, end: true },
      { to: '/admin/analytics/funnel',   label: 'Funnel',    icon: FunnelIcon },
      { to: '/admin/analytics/journeys', label: 'Journeys',  icon: RouteIcon },
      { to: '/admin/errors',             label: 'Errors',    icon: AlertIcon },
    ],
  },
];

export default function Sidebar({ user, open }) {
  return (
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
      <Link to="/admin" className={styles.brand} aria-label="Trovarcis Admin home">
        <TrovarcisAdminLogo size={26} />
      </Link>

      <nav className={styles.nav} aria-label="Admin navigation">
        {GROUPS.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            <div className={styles.navGroupLabel}>{group.label}</div>
            {group.items.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.foot}>
        <div className={styles.footUser}>
          <span className={styles.footLabel}>Signed in</span>
          <span className={styles.footEmail} title={user.email}>{user.email}</span>
        </div>
        <Link to="/dashboard" className={styles.exitLink}>
          Exit to app
        </Link>
      </div>
    </aside>
  );
}
