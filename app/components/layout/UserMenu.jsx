import { useEffect, useRef, useState } from 'react';
import { Form, Link, useLocation } from 'react-router';
import styles from '~/styles/modules/layout/UserMenu.module.css';

/**
 * User menu.
 *
 * Trigger: circular avatar with the user's email initial.
 * Panel:   user info block, navigation items, sign out button.
 *
 * Behavior:
 *   - Closes on outside click
 *   - Closes on Escape (returns focus to trigger)
 *   - Closes on route change
 *   - aria-haspopup / aria-expanded on trigger; role="menu" on panel
 */
export default function UserMenu({ user }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;

    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = (user.email?.[0] || '?').toUpperCase();
  const credits = Number.isFinite(user.creditsBalance) ? user.creditsBalance : 0;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar} aria-hidden="true">{initial}</span>
      </button>

      {open && (
        <div className={styles.panel} role="menu">
          <div className={styles.userInfo}>
            <div className={styles.userInitial} aria-hidden="true">{initial}</div>
            <div className={styles.userDetails}>
              <div className={styles.userEmail} title={user.email}>{user.email}</div>
              <div className={styles.userMeta}>{credits.toLocaleString()} credits</div>
            </div>
          </div>

          <div className={styles.divider} />

          <Link to="/dashboard" className={styles.item} role="menuitem">
            Dashboard
          </Link>
          <Link to="/credits" className={styles.item} role="menuitem">
            Buy credits
          </Link>

          {user.role === 'admin' && (
            <>
              <div className={styles.divider} />
              <Link to="/admin" className={styles.item} role="menuitem">
                Admin
              </Link>
            </>
          )}

          <div className={styles.divider} />

          <Form method="post" action="/logout">
            <button type="submit" className={styles.itemDanger} role="menuitem">
              Sign out
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}
