import { useState, useEffect } from 'react';
import { Link, useLocation, useRouteLoaderData, Form } from 'react-router';
import { TrovarcisReachLogo } from '~/components/shared/Logo';
import UserMenu from '~/components/layout/UserMenu';
import {
  ChevronDownIcon,
  MenuIcon,
  CloseIcon,
  GaugeIcon,
  GlobeIcon,
  VerifyIcon,
  TerminalIcon,
  DnsIcon,
  PhoneIcon,
} from '~/components/icons'; 
import styles from '~/styles/modules/layout/Header.module.css';

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Blog", href: "/blog" },
];

const TOOL_LINKS = [
  { label: "Email Scorer", href: "/score", desc: "AI spam analysis", icon: GaugeIcon },
  { label: "Domain Checker", href: "/domain", desc: "DNS and blacklist check", icon: GlobeIcon },
  { label: "Email Verifier", href: "/verify", desc: "Bulk verification", icon: VerifyIcon },
  { label: "SMTP Tester", href: "/smtp-test", desc: "Connection test", icon: TerminalIcon },
  { label: "DNS Generator", href: "/records", desc: "SPF, DKIM, DMARC", icon: DnsIcon },
  { label: "Number Verifier", href: "/verify-number", desc: "Phone validation", icon: PhoneIcon },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const location = useLocation();

  // Root loader exposes the current user (or null) via useRouteLoaderData.
  const rootData = useRouteLoaderData('root');
  const user = rootData?.user || null;

  useEffect(() => {
    setMobileOpen(false);
    setMobileToolsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const initial = (user?.email?.[0] || '?').toUpperCase();
  const credits = Number.isFinite(user?.creditsBalance) ? user.creditsBalance : 0;

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>

        <Link to="/" className={styles.logo} aria-label="Trovarcis Reach home">
          <TrovarcisReachLogo size={34} />
        </Link>

        <nav className={styles.desktopNav} aria-label="Main navigation">
          {NAV_LINKS.map((link) =>
            link.href.startsWith('/#') ? (
              <a key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                to={link.href}
                className={`${styles.navLink} ${location.pathname === link.href ? styles.navLinkActive : ''}`}
              >
                {link.label}
              </Link>
            )
          )}

          <div className={styles.dropdown}>
            <Link to="/tools" className={styles.navLink}>
              Tools
              <ChevronDownIcon size={14} className={styles.chevron} />
            </Link>

            <div className={styles.dropdownPanel}>
              <div className={styles.dropdownGrid}>
                {TOOL_LINKS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link key={tool.href} to={tool.href} className={styles.dropdownItem}>
                      <span className={styles.dropdownIcon}>
                        <Icon size={20} />
                      </span>
                      <span className={styles.dropdownText}>
                        <span className={styles.dropdownLabel}>{tool.label}</span>
                        <span className={styles.dropdownDesc}>{tool.desc}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>

        <div className={styles.actions}>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className={`${styles.navLink} ${location.pathname === '/dashboard' ? styles.navLinkActive : ''}`}
              >
                Dashboard
              </Link>
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Link to="/login" className={styles.signIn}>Sign in</Link>
              <Link to="/tools" className={styles.downloadBtn}>Try Free</Link>
            </>
          )}
        </div>

        <button
          className={styles.mobileToggle}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />
      )}

      <nav className={`${styles.mobileNav} ${mobileOpen ? styles.mobileNavOpen : ''}`}
        aria-label="Mobile navigation">
        {NAV_LINKS.map((link) =>
          link.href.startsWith('/#') ? (
            <a
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ) : (
            <Link
              key={link.href}
              to={link.href}
              className={styles.mobileLink}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          )
        )}

        <button
          className={styles.mobileLink}
          onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
        >
          Tools
          <ChevronDownIcon
            size={16}
            className={`${styles.mobileChevron} ${mobileToolsOpen ? styles.mobileChevronOpen : ''}`}
          />
        </button>

        {mobileToolsOpen && (
          <div className={styles.mobileToolsList}>
            {TOOL_LINKS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  to={tool.href}
                  className={styles.mobileToolItem}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={16} />
                  {tool.label}
                </Link>
              );
            })}
            <Link
              to="/tools"
              className={`${styles.mobileToolItem} ${styles.mobileViewAll}`}
              onClick={() => setMobileOpen(false)}
            >
              View all tools
            </Link>
          </div>
        )}

        {user ? (
          <div className={styles.mobileUserSection}>
            <div className={styles.mobileUserCard}>
              <div className={styles.mobileAvatar} aria-hidden="true">{initial}</div>
              <div className={styles.mobileUserText}>
                <div className={styles.mobileUserEmail} title={user.email}>{user.email}</div>
                <div className={styles.mobileUserMeta}>{credits.toLocaleString()} credits</div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className={styles.mobileAuthLink}
              onClick={() => setMobileOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              to="/credits"
              className={styles.mobileAuthLink}
              onClick={() => setMobileOpen(false)}
            >
              Buy credits
            </Link>
            <Link
              to="/account/settings"
              className={styles.mobileAuthLink}
              onClick={() => setMobileOpen(false)}
            >
              Account settings
            </Link>

            {user.role === 'admin' && (
              <Link
                to="/admin"
                className={styles.mobileAuthLink}
                onClick={() => setMobileOpen(false)}
              >
                Admin
              </Link>
            )}

            <Form method="post" action="/logout">
              <button type="submit" className={styles.mobileSignOut}>
                Sign out
              </button>
            </Form>
          </div>
        ) : (
          <div className={styles.mobileCta}>
            <Link
              to="/tools"
              className={styles.mobileDownload}
              onClick={() => setMobileOpen(false)}
            >
              Try Free
            </Link>
            <Link
              to="/login"
              className={styles.mobileSignIn}
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
