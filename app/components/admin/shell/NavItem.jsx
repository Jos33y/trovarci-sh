// Single admin sidebar nav row - icon + label + active rail.
import { NavLink } from 'react-router';
import styles from '~/styles/modules/admin/shell/Sidebar.module.css';

export default function NavItem({ to, label, icon: Icon, end = false, indent = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => {
        const cls = [styles.navItem];
        if (indent) cls.push(styles.navItemChild);
        if (isActive) cls.push(styles.navItemActive);
        return cls.join(' ');
      }}
    >
      {Icon ? (
        <span className={styles.navIcon} aria-hidden="true">
          <Icon size={16} />
        </span>
      ) : null}
      <span className={styles.navLabel}>{label}</span>
    </NavLink>
  );
}
