// Admin contact messages list - filterable, click-through opens a triage drawer.
import { useEffect, useState } from 'react';
import { Form, useLoaderData, useRevalidator, useSubmit } from 'react-router';
import { requireAdmin, adminListContactMessages } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import CloseIcon from '~/components/icons/CloseIcon';
import styles from '~/styles/modules/routes/admin';
import drawer from '~/styles/modules/admin/ErrorDrawer.module.css';

export const meta = () => [
  { title: 'Messages | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const STATUS_OPTS  = ['', 'new', 'read', 'replied', 'spam'];
const SUBJECT_OPTS = ['', 'general', 'payment', 'bug', 'feature', 'partnership', 'press'];

const SUBJECT_LABEL = {
  general:     'General',
  payment:     'Payment',
  bug:         'Bug',
  feature:     'Feature',
  partnership: 'Partnership',
  press:       'Press',
};

const STATUS_LABEL = {
  '':       'all',
  new:      'new',
  read:     'read',
  replied:  'replied',
  spam:     'spam',
};

const STATUS_TONE = {
  new:     drawer.badgeWarning,
  read:    drawer.badgeNeutral,
  replied: drawer.badgeSuccess,
  spam:    drawer.badgeError,
};

const STATUS_TONE_LIST = {
  new:     'badgeWarning',
  read:    'badgeNeutral',
  replied: 'badgeSuccess',
  spam:    'badgeError',
};

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const status  = url.searchParams.get('status')  || null;
  const subject = url.searchParams.get('subject') || null;
  const q       = url.searchParams.get('q')       || null;
  const page    = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit  = 50;
  const offset = (page - 1) * limit;

  const messages = await adminListContactMessages({
    status, subject, q: q || null, limit, offset,
  });

  return {
    messages,
    status:  status  || '',
    subject: subject || '',
    q:       q       || '',
    page,
  };
}

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

export default function AdminMessages() {
  const { messages, status, subject, q, page } = useLoaderData();
  const revalidator = useRevalidator();
  const submit = useSubmit();

  const onFilterChange = (ev) => submit(ev.currentTarget.form, { replace: true });

  const [openId,    setOpenId]    = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [newStatus, setNewStatus] = useState('read');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [drawerErr, setDrawerErr] = useState('');

  useEffect(() => {
    if (openId == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  useEffect(() => {
    if (openId == null) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openId]);

  const openDrawer = async (id) => {
    setOpenId(id);
    setDetail(null);
    setNotes('');
    setNewStatus('read');
    setDrawerErr('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/messages/${id}`, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setDrawerErr(data.error || `Could not load message (${res.status})`);
      } else {
        setDetail(data.message || null);
        setNewStatus(data.message?.status === 'new' ? 'read' : (data.message?.status || 'read'));
        setNotes(data.message?.notes || '');
      }
    } catch (err) {
      setDrawerErr(err?.message || 'Could not load message');
    } finally {
      setLoading(false);
    }
  };

  const closeDrawer = () => {
    setOpenId(null);
    setDetail(null);
    setNotes('');
    setNewStatus('read');
    setDrawerErr('');
    setSaving(false);
  };

  const saveStatus = async () => {
    if (!openId || saving) return;
    setSaving(true);
    setDrawerErr('');
    try {
      const res = await fetch(`/api/admin/messages/${openId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, notes: notes.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setDrawerErr(body.error || `Could not update (${res.status})`);
        setSaving(false);
        return;
      }
      revalidator.revalidate();
      closeDrawer();
    } catch (err) {
      setDrawerErr(err?.message || 'Could not update');
      setSaving(false);
    }
  };

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Messages</h1>
          <p className={styles.pageSubtitle}>Contact form submissions and triage</p>
        </div>
      </header>

      <Form method="get" className={styles.tableToolbar}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} onChange={onFilterChange} className={styles.filterSelect}>
            {STATUS_OPTS.map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="subject">Subject</label>
          <select id="subject" name="subject" defaultValue={subject} onChange={onFilterChange} className={styles.filterSelect}>
            {SUBJECT_OPTS.map((v) => <option key={v} value={v}>{v ? SUBJECT_LABEL[v] : 'all'}</option>)}
          </select>
        </div>
        <div className={styles.toolbarSearch}>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Search email, name, or content"
            defaultValue={q}
            className={styles.filterInput}
            aria-label="Search messages"
          />
        </div>
      </Form>

      {messages.length === 0 ? (
        <EmptyState
          variant="search"
          title="No messages match"
          body="Either nobody has sent anything, or your filters are too narrow."
        />
      ) : (
        <>
          <div className={styles.tableCaption}>
            <span><strong>{messages.length}</strong> {messages.length === 1 ? 'message' : 'messages'} · page <strong>{page}</strong></span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 220 }} />
                <col />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Message</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => openDrawer(m.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        openDrawer(m.id);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open message from ${m.email}`}
                  >
                    <td data-label="When" className={styles['td--muted']}>{timeAgo(m.created_at)}</td>
                    <td data-label="Subject" className={styles['td--mono']}>{SUBJECT_LABEL[m.subject] || m.subject}</td>
                    <td data-label="From">
                      <div className={styles.fromName}>{m.name}</div>
                      <div className={styles.fromEmail}>{m.email}</div>
                    </td>
                    <td data-label="Message">
                      <span className={styles.preview}>
                        {m.message_preview}{m.message_length > 120 ? '...' : ''}
                      </span>
                    </td>
                    <td data-label="Source" className={styles['td--mono']}>{m.source}</td>
                    <td data-label="Status">
                      <span className={`${styles.badge} ${styles[STATUS_TONE_LIST[m.status] || 'badgeNeutral']}`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageNote}>Page {page}</span>
          </div>
        </>
      )}

      <div
        className={`${drawer.backdrop} ${openId != null ? drawer.backdropOpen : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <aside
        className={`${drawer.drawer} ${openId != null ? drawer.drawerOpen : ''}`}
        role="dialog"
        aria-label="Message details"
        aria-hidden={openId == null}
      >
        <header className={drawer.head}>
          <div className={drawer.headLeft}>
            <div className={drawer.headTitle}>
              {detail ? `${SUBJECT_LABEL[detail.subject] || detail.subject}` : 'Message'}
            </div>
            <div className={drawer.headSub}>
              {detail ? formatDate(detail.created_at) : ''}
            </div>
          </div>
          <button type="button" onClick={closeDrawer} className={drawer.closeBtn} aria-label="Close drawer">
            <CloseIcon size={18} />
          </button>
        </header>

        <div className={drawer.body}>
          {loading && <div className={drawer.loading}>Loading...</div>}

          {!loading && drawerErr && !detail && (
            <div className={drawer.error}>{drawerErr}</div>
          )}

          {!loading && detail && (
            <>
              <div className={drawer.badgeRow}>
                <span className={`${drawer.badge} ${STATUS_TONE[detail.status] || drawer.badgeNeutral}`}>
                  {detail.status}
                </span>
                <span className={`${drawer.badge} ${drawer.badgeNeutral}`}>{detail.source}</span>
              </div>

              <section className={drawer.section}>
                <h3 className={drawer.sectionTitle}>From</h3>
                <div className={drawer.kv}>
                  <div className={drawer.kvKey}>Name</div>
                  <div className={drawer.kvVal}>{detail.name}</div>
                  <div className={drawer.kvKey}>Email</div>
                  <div className={drawer.kvVal}>
                    <a href={`mailto:${detail.email}`} className={drawer.kvLink}>{detail.email}</a>
                  </div>
                  {detail.linked_user_email && (
                    <>
                      <div className={drawer.kvKey}>Account</div>
                      <div className={drawer.kvVal}>
                        <a href={`/admin/users/${detail.user_id}`} className={drawer.kvLink}>
                          {detail.linked_user_email}
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className={drawer.section}>
                <h3 className={drawer.sectionTitle}>Message</h3>
                <pre className={`${drawer.pre} ${drawer.preMessage}`}>{detail.message}</pre>
              </section>

              {detail.notes && (
                <section className={drawer.section}>
                  <h3 className={drawer.sectionTitle}>Internal notes</h3>
                  <pre className={drawer.pre}>{detail.notes}</pre>
                </section>
              )}

              <section className={drawer.section}>
                <h3 className={drawer.sectionTitle}>Metadata</h3>
                <div className={drawer.kv}>
                  <div className={drawer.kvKey}>IP</div>
                  <div className={drawer.kvValMono}>{detail.ip_address || '-'}</div>
                  {detail.user_agent && (
                    <>
                      <div className={drawer.kvKey}>UA</div>
                      <div className={drawer.kvValMono}>{detail.user_agent}</div>
                    </>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {!loading && detail && (
          <footer className={drawer.foot}>
            <div className={drawer.resolveForm}>
              <label htmlFor="msg-status" className={drawer.formLabel}>Change status</label>
              <select
                id="msg-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className={drawer.formSelect}
              >
                <option value="new">New</option>
                <option value="read">Read</option>
                <option value="replied">Replied</option>
                <option value="spam">Spam</option>
              </select>

              <label htmlFor="msg-notes" className={drawer.formLabel}>Internal notes (optional)</label>
              <textarea
                id="msg-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={drawer.formTextarea}
                maxLength={1000}
                placeholder="Optional. Up to 1000 chars. Not visible to the sender."
              />

              {drawerErr && <div className={drawer.error}>{drawerErr}</div>}

              <div className={drawer.actions}>
                <button type="button" onClick={closeDrawer} className={drawer.btnGhost} disabled={saving}>
                  Cancel
                </button>
                <button type="button" onClick={saveStatus} className={drawer.btnPrimary} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
