// /account/settings - data export + account deletion. Both require explicit confirmation.

import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import styles from '~/styles/modules/routes/accountSettings.module.css';

export const meta = () => [
  { title: 'Account settings | Trovarcis Reach' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  const user = await requireUser(request);
  return { user: { email: user.email, role: user.role, creditsBalance: user.creditsBalance } };
}

export default function AccountSettings() {
  const { user } = useLoaderData();
  const navigate = useNavigate();

  const [confirmText, setConfirmText] = useState('');
  const [deleting,    setDeleting]    = useState(false);
  const [deleteErr,   setDeleteErr]   = useState('');

  const handleExport = () => {
    // Triggers a file download via the GET endpoint.
    window.location.href = '/api/account/export';
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteErr('');
    try {
      const res = await fetch('/api/account/delete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirm: confirmText }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setDeleteErr(body.error || `Could not delete (${res.status})`);
        setDeleting(false);
        return;
      }
      // Session cookie was cleared server-side. Bounce to home.
      window.location.href = '/?deleted=1';
    } catch (err) {
      setDeleteErr(err?.message || 'Could not delete');
      setDeleting(false);
    }
  };

  const canDelete = confirmText === 'DELETE' && !deleting && user.role !== 'admin';

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container">

          <header className={styles.head}>
            <p className={styles.eyebrow}>Account</p>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>Signed in as {user.email}</p>
          </header>

          {/* ─── Export ─── */}
          <section className={styles.card}>
            <header className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>Download your data</h2>
                <p className={styles.cardSub}>
                  Get a JSON file with everything we hold about your account: profile, credit transactions,
                  payments, verification jobs, and any contact messages you've sent.
                </p>
              </div>
            </header>
            <div className={styles.cardActions}>
              <button type="button" onClick={handleExport} className={styles.btnPrimary}>
                Download data export
              </button>
            </div>
          </section>

          {/* ─── Delete ─── */}
          <section className={`${styles.card} ${styles.cardDanger}`}>
            <header className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>Delete account</h2>
                <p className={styles.cardSub}>
                  This is permanent. Your email and contact details are anonymized, your password is removed,
                  and all active sessions are revoked. Your transaction and payment history stays for tax and
                  audit purposes but is no longer linked to identifying information. Any remaining credits
                  cannot be refunded.
                </p>
                {user.role === 'admin' && (
                  <p className={styles.adminWarn}>
                    Admin accounts cannot self-delete. Demote your role first or have another admin remove you.
                  </p>
                )}
              </div>
            </header>

            <div className={styles.deleteForm}>
              <label htmlFor="confirm" className={styles.label}>
                Type <span className={styles.literal}>DELETE</span> to confirm
              </label>
              <input
                id="confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className={styles.input}
                autoComplete="off"
                disabled={user.role === 'admin' || deleting}
                placeholder="DELETE"
              />

              {deleteErr && <div className={styles.error} role="alert">{deleteErr}</div>}

              <div className={styles.cardActions}>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className={styles.btnGhost}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className={styles.btnDanger}
                  disabled={!canDelete}
                >
                  {deleting ? 'Deleting...' : 'Delete my account'}
                </button>
              </div>
            </div>
          </section>

        </div>
      </main>
      <Footer />
    </>
  );
}
