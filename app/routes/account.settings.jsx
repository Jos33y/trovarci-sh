// /account/settings - Profile, Security (password + active sessions), Plan & credits, Data & privacy.

import { useState } from 'react';
import { Link, useLoaderData, useNavigate, useRevalidator } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSessionFromRequest, listUserSessions } from '~/utils/session.server';
import { redirect } from 'react-router';
import styles from '~/styles/modules/routes/accountSettings.module.css';
import { formatInt } from '~/utils/format';

export const meta = () => [
  { title: 'Account settings | Trovarcis Reach' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    const url = new URL(request.url);
    const qs = new URLSearchParams({ redirectTo: url.pathname + url.search });
    throw redirect(`/login?${qs.toString()}`);
  }

  const sessions = await listUserSessions(session.user.id);

  return {
    user: {
      id:              session.user.id,
      email:           session.user.email,
      role:            session.user.role,
      creditsBalance:  session.user.creditsBalance,
      emailVerifiedAt: session.user.emailVerifiedAt,
    },
    currentSessionId: session.sessionId,
    sessions: sessions.map((s) => ({
      id:          s.id,
      userAgent:   s.user_agent || '',
      ipAddress:   s.ip_address || '',
      createdAt:   s.created_at,
      lastSeenAt:  s.last_seen_at,
      expiresAt:   s.expires_at,
    })),
  };
}

// Best-effort UA parse for human-readable labels. Falls back to "Unknown device".
function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };
  const u = ua.toLowerCase();

  let browser = 'Browser';
  if (u.includes('edg/'))            browser = 'Edge';
  else if (u.includes('chrome/'))    browser = 'Chrome';
  else if (u.includes('firefox/'))   browser = 'Firefox';
  else if (u.includes('safari/'))    browser = 'Safari';

  let os = 'Unknown';
  if      (u.includes('windows'))    os = 'Windows';
  else if (u.includes('mac os x') || u.includes('macintosh')) os = 'macOS';
  else if (u.includes('android'))    os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ipod')) os = 'iOS';
  else if (u.includes('linux'))      os = 'Linux';

  return { browser, os };
}

function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60)    return 'just now';
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AccountSettings() {
  const { user, currentSessionId, sessions } = useLoaderData();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={styles.shell}>

          <header className={styles.head}>
            <p className={styles.eyebrow}>Account</p>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>{user.email}</p>
          </header>

          <ProfileSection user={user} />
          <SecuritySection user={user} currentSessionId={currentSessionId} sessions={sessions} />
          <PlanSection user={user} />
          <DataSection user={user} />

        </div>
      </main>
      <Footer />
    </>
  );
}

// ─── Profile ────────────────────────────────────────────────────────────

function ProfileSection({ user }) {
  return (
    <section className={styles.section} id="profile">
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <p className={styles.sectionSub}>Identity tied to this account.</p>
      </header>

      <div className={styles.card}>
        <dl className={styles.kvList}>
          <div className={styles.kvRow}>
            <dt className={styles.kvLabel}>Email</dt>
            <dd className={styles.kvValue}>
              <span className={styles.mono}>{user.email}</span>
              {user.emailVerifiedAt ? (
                <span className={`${styles.pill} ${styles.pillSuccess}`}>Verified</span>
              ) : (
                <span className={`${styles.pill} ${styles.pillWarning}`}>Unverified</span>
              )}
            </dd>
          </div>
          <div className={styles.kvRow}>
            <dt className={styles.kvLabel}>Account ID</dt>
            <dd className={`${styles.kvValue} ${styles.mono} ${styles.idValue}`}>{user.id}</dd>
          </div>
          <div className={styles.kvRow}>
            <dt className={styles.kvLabel}>Role</dt>
            <dd className={styles.kvValue}>
              <span className={`${styles.pill} ${user.role === 'admin' ? styles.pillAccent : styles.pillNeutral}`}>
                {user.role === 'admin' ? 'Admin' : 'User'}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// ─── Security ───────────────────────────────────────────────────────────

function SecuritySection({ user, currentSessionId, sessions }) {
  return (
    <section className={styles.section} id="security">
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Security</h2>
        <p className={styles.sectionSub}>Password and active devices.</p>
      </header>

      <ChangePasswordCard />
      <SessionsCard currentSessionId={currentSessionId} sessions={sessions} />
    </section>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');
  const [ok,      setOk]      = useState(false);

  const canSubmit =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    !busy;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    setOk(false);
    try {
      const res = await fetch('/api/account/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setErr(body.error || `Could not change password (${res.status})`);
        setBusy(false);
        return;
      }
      setOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setBusy(false);
    } catch (e) {
      setErr(e?.message || 'Could not change password');
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardLead}>
        <h3 className={styles.cardTitle}>Change password</h3>
        <p className={styles.cardSub}>
          You will be signed out of every other device. This device stays signed in.
        </p>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="cp-current" className={styles.fieldLabel}>Current password</label>
          <input
            id="cp-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={styles.input}
            autoComplete="current-password"
            disabled={busy}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="cp-new" className={styles.fieldLabel}>New password</label>
          <input
            id="cp-new"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={styles.input}
            autoComplete="new-password"
            disabled={busy}
            minLength={8}
          />
          <p className={styles.fieldHint}>At least 8 characters.</p>
        </div>
        <div className={styles.field}>
          <label htmlFor="cp-confirm" className={styles.fieldLabel}>Confirm new password</label>
          <input
            id="cp-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={styles.input}
            autoComplete="new-password"
            disabled={busy}
          />
          {confirm.length > 0 && next !== confirm && (
            <p className={styles.fieldError}>Passwords do not match.</p>
          )}
        </div>
      </div>

      {err && <div className={styles.alertError} role="alert">{err}</div>}
      {ok && <div className={styles.alertSuccess} role="status">Password changed. Other devices were signed out.</div>}

      <div className={styles.cardActions}>
        <button type="button" onClick={onSubmit} disabled={!canSubmit} className={styles.btnPrimary}>
          {busy ? 'Updating...' : 'Update password'}
        </button>
      </div>
    </div>
  );
}

function SessionsCard({ currentSessionId, sessions }) {
  const revalidator = useRevalidator();
  const [busyId,    setBusyId]    = useState(null);
  const [busyAll,   setBusyAll]   = useState(false);
  const [err,       setErr]       = useState('');

  const otherCount = sessions.filter((s) => s.id !== currentSessionId).length;

  const revokeOne = async (sessionId) => {
    if (busyId) return;
    setBusyId(sessionId);
    setErr('');
    try {
      const res = await fetch(`/api/account/sessions/${sessionId}/revoke`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setErr(body.error || `Could not sign out device (${res.status})`);
      } else {
        revalidator.revalidate();
      }
    } catch (e) {
      setErr(e?.message || 'Could not sign out device');
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    if (busyAll || otherCount === 0) return;
    setBusyAll(true);
    setErr('');
    try {
      const res = await fetch('/api/account/sessions/revoke-others', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setErr(body.error || `Could not sign out other devices (${res.status})`);
      } else {
        revalidator.revalidate();
      }
    } catch (e) {
      setErr(e?.message || 'Could not sign out other devices');
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardLead}>
        <h3 className={styles.cardTitle}>Active sessions</h3>
        <p className={styles.cardSub}>
          Every device currently signed in to this account.
        </p>
      </div>

      <ul className={styles.sessionList}>
        {sessions.map((s) => {
          const { browser, os } = parseUA(s.userAgent);
          const isCurrent = s.id === currentSessionId;
          return (
            <li key={s.id} className={styles.sessionRow}>
              <div className={styles.sessionMain}>
                <div className={styles.sessionTitle}>
                  {browser} on {os}
                  {isCurrent && <span className={`${styles.pill} ${styles.pillAccent}`}>This device</span>}
                </div>
                <div className={styles.sessionMeta}>
                  <span className={styles.mono}>{s.ipAddress || '-'}</span>
                  <span className={styles.dot}>·</span>
                  <span>Active {formatRelative(s.lastSeenAt)}</span>
                  <span className={styles.dot}>·</span>
                  <span>Signed in {formatDate(s.createdAt)}</span>
                </div>
              </div>
              <div className={styles.sessionAction}>
                {isCurrent ? null : (
                  <button
                    type="button"
                    onClick={() => revokeOne(s.id)}
                    disabled={busyId === s.id || busyAll}
                    className={styles.btnGhost}
                  >
                    {busyId === s.id ? 'Signing out...' : 'Sign out'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {err && <div className={styles.alertError} role="alert">{err}</div>}

      {otherCount > 0 && (
        <div className={styles.cardActions}>
          <button
            type="button"
            onClick={revokeOthers}
            disabled={busyAll || otherCount === 0}
            className={styles.btnGhost}
          >
            {busyAll ? 'Signing out...' : `Sign out other devices (${otherCount})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Plan & credits ─────────────────────────────────────────────────────

function PlanSection({ user }) {
  return (
    <section className={styles.section} id="plan">
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Plan and credits</h2>
        <p className={styles.sectionSub}>Your current balance and history.</p>
      </header>

      <div className={styles.card}>
        <div className={styles.balanceRow}>
          <div className={styles.balanceMain}>
            <p className={styles.balanceLabel}>Credit balance</p>
            <p className={styles.balanceValue}>
              {formatInt(user.creditsBalance || 0)}
            </p>
          </div>
          <div className={styles.balanceActions}>
            <Link to="/credits" className={styles.btnPrimary}>Buy credits</Link>
            <Link to="/dashboard" className={styles.btnGhost}>View dashboard</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Data & privacy ─────────────────────────────────────────────────────

function DataSection({ user }) {
  const navigate = useNavigate();

  const [confirmText, setConfirmText] = useState('');
  const [deleting,    setDeleting]    = useState(false);
  const [deleteErr,   setDeleteErr]   = useState('');

  const handleExport = () => {
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
      window.location.href = '/?deleted=1';
    } catch (err) {
      setDeleteErr(err?.message || 'Could not delete');
      setDeleting(false);
    }
  };

  const canDelete = confirmText === 'DELETE' && !deleting && user.role !== 'admin';

  return (
    <section className={styles.section} id="data">
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Data and privacy</h2>
        <p className={styles.sectionSub}>Export your data or close the account.</p>
      </header>

      <div className={styles.card}>
        <div className={styles.cardLead}>
          <h3 className={styles.cardTitle}>Download your data</h3>
          <p className={styles.cardSub}>
            A JSON file with your profile, credit transactions, payments, verification jobs, and contact messages.
          </p>
        </div>
        <div className={styles.cardActions}>
          <button type="button" onClick={handleExport} className={styles.btnGhost}>
            Download data export
          </button>
        </div>
      </div>

      <div className={`${styles.card} ${styles.cardDanger}`}>
        <div className={styles.cardLead}>
          <h3 className={`${styles.cardTitle} ${styles.cardTitleDanger}`}>Delete account</h3>
          <p className={styles.cardSub}>
            Permanent. Your email and contact details are anonymized, your password is removed, and all active sessions are revoked. Transaction and payment history stays for tax and audit purposes but is no longer linked to identifying information. Any remaining credits cannot be refunded.
          </p>
          {user.role === 'admin' && (
            <p className={styles.adminWarn}>
              Admin accounts cannot self-delete. Demote your role first or have another admin remove you.
            </p>
          )}
        </div>

        <div className={styles.deleteForm}>
          <label htmlFor="confirm" className={styles.fieldLabel}>
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

          {deleteErr && <div className={styles.alertError} role="alert">{deleteErr}</div>}

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
      </div>
    </section>
  );
}
