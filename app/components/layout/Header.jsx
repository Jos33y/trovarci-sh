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
  { label: "Email Scorer",    href: "/score",         desc: "AI spam-trigger scoring",      icon: GaugeIcon },
  { label: "Domain Checker",  href: "/domain",        desc: "DNS + blacklist audit",        icon: GlobeIcon },
  { label: "Email Verifier",  href: "/verify",        desc: "Bulk address verification",    icon: VerifyIcon },
  { label: "SMTP Tester",     href: "/smtp-test",     desc: "Auth, TLS, MX diagnostics",    icon: TerminalIcon },
  { label: "DNS Generator",   href: "/records",       desc: "SPF, DKIM, DMARC records",     icon: DnsIcon },
  { label: "Number Verifier", href: "/verify-number", desc: "Real carrier + line type",     icon: PhoneIcon },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const location = useLocation();

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
              <Link to="/signup" className={styles.ctaBtn}>Start free</Link>
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

      <nav
        className={`${styles.mobileNav} ${mobileOpen ? styles.mobileNavOpen : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        <div className={styles.mobileNoise} aria-hidden="true" />
        <div className={styles.mobileGrid} aria-hidden="true" />

        <div className={styles.mobileScroll}>

          <div className={styles.mobileSection}>
            <span className={styles.mobileKicker}>Navigate</span>

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
              aria-expanded={mobileToolsOpen}
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
          </div>

          {user ? (
            <div className={styles.mobileSection}>
              <span className={styles.mobileKicker}>Account</span>

              <div className={styles.mobileUserCard}>
                <div className={styles.mobileAvatar} aria-hidden="true">{initial}</div>
                <div className={styles.mobileUserText}>
                  <div className={styles.mobileUserEmail} title={user.email}>{user.email}</div>
                  <div className={styles.mobileUserMeta}>{credits.toLocaleString()} credits</div>
                </div>
              </div>

              <Link
                to="/dashboard"
                className={styles.mobileLink}
                onClick={() => setMobileOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/credits"
                className={styles.mobileLink}
                onClick={() => setMobileOpen(false)}
              >
                Buy credits
              </Link>
              <Link
                to="/account/settings"
                className={styles.mobileLink}
                onClick={() => setMobileOpen(false)}
              >
                Account settings
              </Link>

              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  className={styles.mobileLink}
                  onClick={() => setMobileOpen(false)}
                >
                  Admin
                </Link>
              )}

              <Form method="post" action="/logout" className={styles.mobileSignOutForm}>
                <button type="submit" className={styles.mobileSignOut}>
                  Sign out
                </button>
              </Form>
            </div>
          ) : (
            <div className={styles.mobileCta}>
              <Link
                to="/signup"
                className={styles.mobileCtaPrimary}
                onClick={() => setMobileOpen(false)}
              >
                Start free
              </Link>
              <Link
                to="/login"
                className={styles.mobileCtaSecondary}
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <p className={styles.mobileCtaNote}>10 free credits on signup. No card.</p>
            </div>
          )}

        </div>
      </nav>
    </header>
  );
}
