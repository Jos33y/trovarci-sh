import { useState, useEffect } from 'react';
import { useFetcher } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/download.module.css';

export const meta = () => [
  { title: 'Download Trovarcis Reach | Bulk Email & SMS Desktop App' },
  {
    name: 'description',
    content:
      'Download Trovarcis Reach - the one-time purchase bulk email and SMS desktop app for Windows, macOS, and Linux. No subscription. No cloud dependency.',
  },
  { property: 'og:title', content: 'Download Trovarcis Reach' },
  {
    property: 'og:description',
    content:
      'Bulk email and SMS software you own forever. One-time purchase. Runs offline.',
  },
  { property: 'og:url', content: 'https://trovarci.sh/download' },
  { property: 'og:type', content: 'website' },
  { name: 'twitter:card', content: 'summary_large_image' },
];

function WindowsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 5.5L11 4v7.5H3V5.5Z" fill="currentColor" />
      <path d="M12 3.8L21 2.5v9H12V3.8Z" fill="currentColor" />
      <path d="M3 12.5h8V20L3 18.5v-6Z" fill="currentColor" />
      <path d="M12 12.5h9v9L12 20.2v-7.7Z" fill="currentColor" />
    </svg>
  );
}

function AppleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.27.06 2.15.69 2.92.69.78 0 2.23-.85 3.74-.72 1.62.14 2.83.84 3.6 2.17-3.27 1.97-2.73 6.34.74 7.52zm-3.23-14c.07 1.62-1.26 2.98-2.73 3.11-.19-1.58 1.23-3.03 2.73-3.11z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinuxIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C8.5 2 6 5 6 8c0 1.5.5 3 1.3 4.2-.3.8-.5 1.6-.5 2.4 0 1.7.8 3.2 2 4.2-.5.3-.8.8-.8 1.4 0 .9.8 1.8 2 1.8h4c1.2 0 2-.9 2-1.8 0-.6-.3-1.1-.8-1.4 1.2-1 2-2.5 2-4.2 0-.8-.2-1.6-.5-2.4C18.5 11 19 9.5 19 8c0-3-2.5-6-7-6zm-1.5 9.5c-.6 0-1-.5-1-1 0-.6.4-1 1-1s1 .4 1 1c0 .5-.4 1-1 1zm3 0c-.6 0-1-.5-1-1 0-.6.4-1 1-1s1 .4 1 1c0 .5-.4 1-1 1z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PLATFORM_BADGES = [
  { icon: WindowsIcon, label: 'Windows', sub: '10 / 11', soon: false },
  { icon: AppleIcon,   label: 'macOS',   sub: '12 Monterey+', soon: false },
  { icon: LinuxIcon,   label: 'Linux',   sub: '.deb / .AppImage', soon: false },
];

const REASONS = [
  {
    title: 'No monthly fee, ever',
    body: 'Pay once. Use for years. No subscription that locks you out when you miss a payment.',
  },
  {
    title: 'Runs completely offline',
    body: 'Your contacts stay on your machine. No cloud upload required to send a single email.',
  },
  {
    title: 'Your SMTP, your rules',
    body: 'Connect any SMTP provider - Gmail, SendGrid, Mailgun, your own server. You own the stack.',
  },
  {
    title: 'Desktop performance',
    body: 'No browser tab throttling. No server timeouts. Native speed for large campaigns.',
  },
];

export default function DownloadPage() {
  const fetcher = useFetcher();
  const [email, setEmail] = useState('');

  // The fetcher data is the JSON returned by /api/waitlist's action.
  // Rendering states off it directly avoids a parallel useState/useEffect
  // dance that drifts out of sync with the network.
  const submitted = fetcher.data?.ok === true;
  const errorMsg  = fetcher.data?.ok === false ? (fetcher.data.error || 'Could not save - try again') : null;
  const loading   = fetcher.state === 'submitting';

  // Once submitted, clear the local input so React doesn't keep re-rendering
  // the controlled value after the form is replaced by the success state.
  useEffect(() => {
    if (submitted) setEmail('');
  }, [submitted]);

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroBg} aria-hidden="true" />
          <div className="container">
            <div className={styles.badge}>
              <span className={styles.badgeDot} />
              In development
            </div>

            <h1 className={styles.headline}>
              Own your sending.<br />
              <span className={styles.headlineAccent}>No cloud required.</span>
            </h1>

            <p className={styles.sub}>
              Trovarcis Reach is a desktop app - not another SaaS tab. One-time purchase.
              Runs on Windows, macOS, and Linux. Your contacts never leave your machine.
            </p>

            <div className={styles.platforms}>
              {PLATFORM_BADGES.map(({ icon: Icon, label, sub }) => (
                <div key={label} className={styles.platform}>
                  <Icon size={22} />
                  <div className={styles.platformText}>
                    <span className={styles.platformName}>{label}</span>
                    <span className={styles.platformSub}>{sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Waitlist */}
        <section className={styles.waitlist}>
          <div className="container">
            <div className={styles.waitlistCard}>
              <div className={styles.waitlistLeft}>
                <h2 className={styles.waitlistTitle}>Get notified at launch</h2>
                <p className={styles.waitlistSub}>
                  Early access list gets a 20% launch discount and priority support. No spam - one email when it ships.
                </p>
              </div>
              <div className={styles.waitlistRight}>
                {submitted ? (
                  <div className={styles.successState} role="status" aria-live="polite">
                    <div className={styles.successIcon}>
                      <CheckSmallIcon />
                    </div>
                    <div>
                      <div className={styles.successTitle}>You're on the list</div>
                      <div className={styles.successSub}>We'll email you the moment it launches.</div>
                    </div>
                  </div>
                ) : (
                  <fetcher.Form method="post" action="/api/waitlist" className={styles.form}>
                    <input type="hidden" name="source" value="download_page" />
                    <input
                      className={styles.input}
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      aria-label="Your email address"
                      aria-invalid={errorMsg ? 'true' : undefined}
                      aria-describedby={errorMsg ? 'waitlist-error' : undefined}
                      autoComplete="email"
                    />
                    <button
                      className={styles.submitBtn}
                      type="submit"
                      disabled={loading}
                      aria-busy={loading || undefined}
                    >
                      {loading ? 'Adding...' : 'Notify me'}
                    </button>
                    {errorMsg && (
                      <div id="waitlist-error" className={styles.errorMsg} role="alert">
                        {errorMsg}
                      </div>
                    )}
                  </fetcher.Form>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Mockup area */}
        <section className={styles.mockupSection}>
          <div className="container">
            <div className={styles.mockupFrame}>
              <div className={styles.mockupBar}>
                <div className={styles.mockupDots}>
                  <span className={styles.dot} style={{ background: '#F87171' }} />
                  <span className={styles.dot} style={{ background: '#FB923C' }} />
                  <span className={styles.dot} style={{ background: '#34D399' }} />
                </div>
                <div className={styles.mockupTitle}>Trovarcis Reach - Campaign Manager</div>
              </div>
              <div className={styles.mockupBody}>
                <div className={styles.mockupSidebar}>
                  {['Dashboard', 'Campaigns', 'Contacts', 'SMTP Accounts', 'Reports'].map((item) => (
                    <div key={item} className={styles.mockupSideItem}>{item}</div>
                  ))}
                </div>
                <div className={styles.mockupContent}>
                  <div className={styles.mockupStat}>
                    <div className={styles.mockupStatValue}>12,480</div>
                    <div className={styles.mockupStatLabel}>Delivered</div>
                  </div>
                  <div className={styles.mockupStat}>
                    <div className={styles.mockupStatValue} style={{ color: 'var(--trov-accent)' }}>98.4%</div>
                    <div className={styles.mockupStatLabel}>Delivery Rate</div>
                  </div>
                  <div className={styles.mockupStat}>
                    <div className={styles.mockupStatValue}>4</div>
                    <div className={styles.mockupStatLabel}>SMTP Accounts</div>
                  </div>
                  <div className={styles.mockupProgressLabel}>Campaign progress</div>
                  <div className={styles.mockupProgressTrack}>
                    <div className={styles.mockupProgressFill} style={{ width: '72%' }} />
                  </div>
                  <div className={styles.mockupProgressNote}>72% complete - 3,469 remaining</div>
                </div>
              </div>
            </div>
            <p className={styles.mockupCaption}>Preview mockup - interface subject to change</p>
          </div>
        </section>

        {/* Why desktop */}
        <section className={styles.reasons}>
          <div className="container">
            <h2 className={styles.reasonsTitle}>Why desktop software wins</h2>
            <div className={styles.reasonsGrid}>
              {REASONS.map(({ title, body }) => (
                <div key={title} className={styles.reasonCard}>
                  <div className={styles.reasonCheck}>
                    <CheckSmallIcon />
                  </div>
                  <div>
                    <div className={styles.reasonTitle}>{title}</div>
                    <div className={styles.reasonBody}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className={styles.pricingTeaser}>
          <div className="container">
            <div className={styles.pricingRow}>
              <div className={styles.pricingItem}>
                <div className={styles.pricingPrice}>$0</div>
                <div className={styles.pricingPlan}>Free tier</div>
                <div className={styles.pricingNote}>Up to 500 contacts, 1 SMTP account</div>
              </div>
              <div className={styles.pricingDivider} />
              <div className={styles.pricingItem}>
                <div className={styles.pricingPrice}>$79</div>
                <div className={styles.pricingPlan}>Email Pro</div>
                <div className={styles.pricingNote}>Unlimited contacts, multi-SMTP, AI scoring</div>
              </div>
              <div className={styles.pricingDivider} />
              <div className={styles.pricingItem}>
                <div className={styles.pricingPrice}>$119</div>
                <div className={styles.pricingPlan}>Bundle</div>
                <div className={styles.pricingNote}>Everything + SMS campaigns included</div>
              </div>
            </div>
            <p className={styles.pricingClarify}>One-time purchase. No recurring fees.</p>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
