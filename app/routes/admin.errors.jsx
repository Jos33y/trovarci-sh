// /admin/errors - list view with inline drawer for triage. Click row to view + mark resolved without navigation.

import { useEffect, useState } from 'react';
import { Link, Form, useLoaderData, useRevalidator } from 'react-router';
import { requireAdmin, adminListErrors } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import CloseIcon from '~/components/icons/CloseIcon';
import styles from '~/styles/modules/routes/admin.module.css';
import drawer from '~/styles/modules/admin/ErrorDrawer.module.css';

export const meta = () => [
  { title: 'Errors | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const KIND_OPTS = ['', 'server_route', 'client_route', 'client_script', 'client_async', 'api_call', 'worker', 'webhook'];
const SEV_OPTS  = ['', 'fatal', 'error', 'warning', 'info'];
const RES_OPTS  = ['', 'false', 'true'];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const kind     = url.searchParams.get('kind') || null;
  const severity = url.searchParams.get('severity') || null;
  const resolved = url.searchParams.get('resolved') || null;
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const errors = await adminListErrors({
    kind: kind || null,
    severity: severity || null,
    resolved: resolved || null,
    limit, offset,
  });

  return { errors, kind: kind || '', severity: severity || '', resolved: resolved || '', page };
}

const SEV_BADGE = {
  fatal:   'badgeError',
  error:   'badgeError',
  warning: 'badgeWarning',
  info:    'badgeNeutral',
};

const DRAWER_SEV_BADGE = {
  fatal:   drawer.badgeError,
  error:   drawer.badgeError,
  warning: drawer.badgeWarning,
  info:    drawer.badgeNeutral,
};

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// Renders message safely. Upstream non-string captures occasionally land as '[object Object]' - flag them.
function safeMessage(msg) {
  if (!msg) return '-';
  const s = String(msg);
  if (s === '[object Object]') return '(non-string error - open to inspect)';
  return s.length > 120 ? s.slice(0, 120) + '...' : s;
}

const RESOLVED_LABEL = { '': 'all', 'false': 'unresolved', 'true': 'resolved' };

export default function AdminErrors() {
  const { errors, kind, severity, resolved, page } = useLoaderData();
  const revalidator = useRevalidator();

  const [openId,    setOpenId]    = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [note,      setNote]      = useState('');
  const [resolving, setResolving] = useState(false);
  const [drawerErr, setDrawerErr] = useState('');

  // Esc to close drawer.
  useEffect(() => {
    if (openId == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // Lock body scroll while drawer open.
  useEffect(() => {
    if (openId == null) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openId]);

  const openDrawer = async (id) => {
    setOpenId(id);
    setDetail(null);
    setNote('');
    setDrawerErr('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/errors/${id}`, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setDrawerErr(data.error || `Could not load error (${res.status})`);
      } else {
        setDetail(data.error || null);
      }
    } catch (err) {
      setDrawerErr(err?.message || 'Could not load error');
    } finally {
      setLoading(false);
    }
  };

  const closeDrawer = () => {
    setOpenId(null);
    setDetail(null);
    setNote('');
    setDrawerErr('');
    setResolving(false);
  };

  const markResolved = async () => {
    if (!openId || resolving) return;
    setResolving(true);
    setDrawerErr('');
    try {
      const res = await fetch(`/api/admin/errors/${openId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setDrawerErr(body.error || `Could not mark resolved (${res.status})`);
        setResolving(false);
        return;
      }
      // Success - revalidate the list and close.
      revalidator.revalidate();
      closeDrawer();
    } catch (err) {
      setDrawerErr(err?.message || 'Could not mark resolved');
      setResolving(false);
    }
  };

  const ctx = detail?.redacted_context && typeof detail.redacted_context === 'object'
    ? detail.redacted_context
    : {};

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Errors</h1>
          <p className={styles.pageSubtitle}>Page {page} - {errors.length} {errors.length === 1 ? 'event' : 'events'}</p>
        </div>
      </header>

      <Form method="get" className={styles.filters}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue={kind} className={styles.filterSelect}>
            {KIND_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="severity">Severity</label>
          <select id="severity" name="severity" defaultValue={severity} className={styles.filterSelect}>
            {SEV_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="resolved">Resolved</label>
          <select id="resolved" name="resolved" defaultValue={resolved} className={styles.filterSelect}>
            {RES_OPTS.map((v) => <option key={v} value={v}>{RESOLVED_LABEL[v]}</option>)}
          </select>
        </div>
        <button type="submit" className={styles.formButton}>Apply</button>
      </Form>

      {errors.length === 0 ? (
        <EmptyState
          variant="error"
          title="No errors match"
          body="Either nothing has gone wrong, or your filters are too narrow. The latter is more likely."
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Sev</th>
                <th>Path</th>
                <th>Message</th>
                <th>User</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr
                  key={e.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openDrawer(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      openDrawer(e.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open error ${e.id}`}
                >
                  <td data-label="When" className={styles['td--muted']}>{timeAgo(e.created_at)}</td>
                  <td data-label="Kind" className={styles['td--mono']}>{e.kind}</td>
                  <td data-label="Sev">
                    <span className={`${styles.badge} ${styles[SEV_BADGE[e.severity] || 'badgeNeutral']}`}>{e.severity}</span>
                  </td>
                  <td data-label="Path" className={styles['td--mono']}>{e.path || '-'}</td>
                  <td data-label="Message">{safeMessage(e.message)}</td>
                  <td data-label="User" onClick={(ev) => ev.stopPropagation()}>
                    {e.user_id
                      ? <Link to={`/admin/users/${e.user_id}`} className={styles.rowLink}>{e.user_email || '-'}</Link>
                      : <span className={styles['td--muted']}>-</span>}
                  </td>
                  <td data-label="Status">
                    {e.resolved_at
                      ? <span className={`${styles.badge} ${styles.badgeSuccess}`}>resolved</span>
                      : <span className={`${styles.badge} ${styles.badgeNeutral}`}>open</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pagination}>
        <span className={styles.pageNote}>Page {page}</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {page > 1 ? (
            <Link to={`?${new URLSearchParams({ kind, severity, resolved, page: String(page - 1) }).toString()}`}
                  className={`${styles.formButton} ${styles['formButton--ghost']}`}>Previous</Link>
          ) : null}
          {errors.length === 50 ? (
            <Link to={`?${new URLSearchParams({ kind, severity, resolved, page: String(page + 1) }).toString()}`}
                  className={`${styles.formButton} ${styles['formButton--ghost']}`}>Next</Link>
          ) : null}
        </div>
      </div>

      {/* ─── Drawer ─── */}

      <div
        className={`${drawer.backdrop} ${openId != null ? drawer.backdropOpen : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <aside
        className={`${drawer.drawer} ${openId != null ? drawer.drawerOpen : ''}`}
        role="dialog"
        aria-label="Error details"
        aria-hidden={openId == null}
      >
        <header className={drawer.head}>
          <div className={drawer.headLeft}>
            <div className={drawer.headTitle}>{detail ? `Error #${detail.id}` : 'Error'}</div>
            <div className={drawer.headSub}>{detail ? formatDate(detail.created_at) : ''}</div>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className={drawer.closeBtn}
            aria-label="Close drawer"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <div className={drawer.body}>
          {loading && <div className={drawer.loading}>Loading...</div>}

          {!loading && drawerErr && (
            <div className={drawer.error}>{drawerErr}</div>
          )}

          {!loading && detail && (
            <>
              <div className={drawer.badgeRow}>
                <span className={`${drawer.badge} ${DRAWER_SEV_BADGE[detail.severity] || drawer.badgeNeutral}`}>
                  {detail.severity}
                </span>
                <span className={`${drawer.badge} ${drawer.badgeNeutral}`}>{detail.kind}</span>
                {detail.resolved_at
                  ? <span className={`${drawer.badge} ${drawer.badgeSuccess}`}>resolved</span>
                  : <span className={`${drawer.badge} ${drawer.badgeWarning}`}>open</span>}
              </div>

              <section className={drawer.section}>
                <h3 className={drawer.sectionTitle}>Message</h3>
                <pre className={`${drawer.pre} ${drawer.preMessage}`}>{detail.message || '-'}</pre>
              </section>

              {detail.stack && (
                <section className={drawer.section}>
                  <h3 className={drawer.sectionTitle}>Stack trace</h3>
                  <pre className={`${drawer.pre} ${drawer.preStack}`}>{detail.stack}</pre>
                </section>
              )}

              {Object.keys(ctx).length > 0 && (
                <section className={drawer.section}>
                  <h3 className={drawer.sectionTitle}>Redacted context</h3>
                  <pre className={`${drawer.pre} ${drawer.preContext}`}>{JSON.stringify(ctx, null, 2)}</pre>
                </section>
              )}

              <section className={drawer.section}>
                <h3 className={drawer.sectionTitle}>Details</h3>
                <div className={drawer.kv}>
                  <div className={drawer.kvKey}>Path</div>
                  <div className={drawer.kvValMono}>{detail.path || '-'}</div>

                  <div className={drawer.kvKey}>Method</div>
                  <div className={drawer.kvValMono}>{detail.method || '-'}</div>

                  <div className={drawer.kvKey}>Status</div>
                  <div className={drawer.kvValMono}>{detail.status_code || '-'}</div>

                  <div className={drawer.kvKey}>Country</div>
                  <div className={drawer.kvValMono}>{detail.country || '-'}</div>

                  {detail.user_agent && (
                    <>
                      <div className={drawer.kvKey}>User agent</div>
                      <div className={drawer.kvValMono} style={{ fontSize: 11 }}>{detail.user_agent}</div>
                    </>
                  )}

                  {detail.user_id && (
                    <>
                      <div className={drawer.kvKey}>User</div>
                      <div className={drawer.kvVal}>
                        <Link to={`/admin/users/${detail.user_id}`} className={drawer.kvLink}>
                          {detail.user_email || detail.user_id.slice(0, 8)}
                        </Link>
                      </div>
                    </>
                  )}

                  {detail.resolved_at && (
                    <>
                      <div className={drawer.kvKey}>Resolved</div>
                      <div className={drawer.kvValMono}>{formatDate(detail.resolved_at)}</div>

                      <div className={drawer.kvKey}>By</div>
                      <div className={drawer.kvVal}>{detail.resolved_by_email || detail.resolved_by?.slice(0, 8) || '-'}</div>

                      {detail.resolution_note && (
                        <>
                          <div className={drawer.kvKey}>Note</div>
                          <div className={drawer.kvVal}>{detail.resolution_note}</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {!loading && detail && !detail.resolved_at && (
          <footer className={drawer.foot}>
            <div className={drawer.resolveForm}>
              <label htmlFor="drawer-note" className={drawer.formLabel}>Resolution note (optional)</label>
              <textarea
                id="drawer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={drawer.formTextarea}
                maxLength={500}
                placeholder="Optional. Up to 500 chars."
              />
              {drawerErr && <div className={drawer.error}>{drawerErr}</div>}
              <div className={drawer.actions}>
                <button type="button" onClick={closeDrawer} className={drawer.btnGhost} disabled={resolving}>
                  Cancel
                </button>
                <button type="button" onClick={markResolved} className={drawer.btnPrimary} disabled={resolving}>
                  {resolving ? 'Resolving...' : 'Mark resolved'}
                </button>
              </div>
            </div>
          </footer>
        )}

        {!loading && detail?.resolved_at && (
          <footer className={drawer.foot}>
            <div className={drawer.resolvedNote}>
              <div className={drawer.resolvedTitle}>Resolved</div>
              <div className={drawer.resolvedDetail}>
                {formatDate(detail.resolved_at)}
                {detail.resolved_by_email ? ` by ${detail.resolved_by_email}` : ''}
              </div>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
