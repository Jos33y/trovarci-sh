// /account/sender - the signed-in buyer's Sender licenses, their computers, and the download.

import { Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import { listLicensesForUser } from '~/lib/licenseAdmin.server';
import { listOrdersForUser } from '~/lib/licenseOrders.server';
import { getLatestRelease } from '~/lib/updateFeed.server';
import styles from '~/styles/modules/routes/accountSettings.module.css';

export const meta = () => [
  { title: 'Trovarcis Sender | Your account' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export const headers = () => ({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });

export async function loader({ request }) {
  const user = await requireUser(request);
  const [licenses, orders, release] = await Promise.all([
    listLicensesForUser(user.id),
    listOrdersForUser(user.id),
    getLatestRelease(),
  ]);
  return {
    email: user.email,
    release,
    licenses: licenses.map((l) => ({
      id: l.id.toUpperCase(),
      key: l.status === 'active' ? l.license_key : null,
      status: l.status,
      maxDevices: l.max_devices,
      issuedAt: l.issued_at,
      devices: l.devices.map((d) => ({
        id: d.id,
        label: d.device_label || `Computer ${String(d.device_id).slice(0, 8)}`,
        appVersion: d.app_version,
        lastSeenAt: d.last_seen_at,
      })),
    })),
    openOrders: orders.filter((o) => o.status === 'open').slice(0, 5).map((o) => ({ id: o.id, createdAt: o.created_at, amountCents: o.amount_usd_cents })),
  };
}

const date = (iso) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function AccountSender() {
  const { email, release, licenses, openOrders } = useLoaderData();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.head}>
            <p className={styles.eyebrow}>Account</p>
            <h1 className={styles.title}>Trovarcis Sender</h1>
            <p className={styles.subtitle}>{email}</p>
          </header>

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Download</h2>
              <p className={styles.sectionSub}>
                {release ? `Version ${release.version} for Windows 10 and 11, 64-bit.` : 'For Windows 10 and 11, 64-bit.'}{' '}
                Installed copies update themselves.
              </p>
            </header>
            <div className={styles.card}>
              <div className={styles.cardActions}>
                <a href="/download/windows" className={styles.btnPrimary}>Download for Windows</a>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{licenses.length === 1 ? 'Your license' : 'Your licenses'}</h2>
              <p className={styles.sectionSub}>Each license works on up to 3 computers. To free a computer you no longer use, write to support@trovarcis.com.</p>
            </header>

            {licenses.length === 0 && (
              <div className={styles.card}>
                <p className={styles.cardLead}>No Sender license on this account yet.</p>
                {openOrders.length > 0 && (
                  <p className={styles.cardSub}>
                    {openOrders.map((o) => (
                      <span key={o.id}>
                        <Link to={`/sender/order/${o.id}`}>Order {o.id.slice(0, 8).toUpperCase()}</Link>, {usd(o.amountCents)}, {date(o.createdAt)}, is waiting for payment.{' '}
                      </span>
                    ))}
                  </p>
                )}
                <div className={styles.cardActions}>
                  <Link to="/sender" className={styles.btnGhost}>See Trovarcis Sender</Link>
                </div>
              </div>
            )}

            {licenses.map((l) => (
              <div key={l.id} className={styles.card}>
                <dl className={styles.kvList}>
                  <div className={styles.kvRow}>
                    <dt className={styles.kvLabel}>License</dt>
                    <dd className={styles.kvValue}>
                      <span className={`${styles.mono} ${styles.idValue}`}>{l.id}</span>
                      <span className={`${styles.pill} ${l.status === 'active' ? styles.pillSuccess : styles.pillWarning}`}>
                        {l.status === 'active' ? 'Active' : 'Revoked'}
                      </span>
                    </dd>
                  </div>
                  {l.key && (
                    <div className={styles.kvRow}>
                      <dt className={styles.kvLabel}>Key</dt>
                      <dd className={`${styles.kvValue} ${styles.mono} ${styles.idValue}`}>{l.key}</dd>
                    </div>
                  )}
                  <div className={styles.kvRow}>
                    <dt className={styles.kvLabel}>Issued</dt>
                    <dd className={styles.kvValue}>{date(l.issuedAt)}</dd>
                  </div>
                  <div className={styles.kvRow}>
                    <dt className={styles.kvLabel}>Computers</dt>
                    <dd className={styles.kvValue}>{l.devices.length} of {l.maxDevices} in use</dd>
                  </div>
                  {l.devices.map((d) => (
                    <div key={d.id} className={styles.kvRow}>
                      <dt className={styles.kvLabel}>{d.label}</dt>
                      <dd className={`${styles.kvValue} ${styles.muted}`}>
                        {d.appVersion ? `Version ${d.appVersion}, ` : ''}last seen {date(d.lastSeenAt)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
