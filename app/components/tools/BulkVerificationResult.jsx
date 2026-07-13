/* ═══════════════════════════════════════════════════════════════════════════
   BulkVerificationResult

   The post-job results panel for bulk verification, shared by both the
   Email Verifier and Number Verifier. Takes a `type` prop and adapts:

     type='email'   -> verdict labels (Valid/Risky/Invalid), email columns
                       (email, type-flag, error-code), list-health verdict,
                       SMTP-tester upsell when list is clean
     type='phone'   -> verdict labels (Mobile/Landline-VoIP/Invalid),
                       phone columns (number, line type, carrier, SMS),
                       carrier rollup, no list-health (different mental model)

   ─── Architecture ───
   On mount, fetches /api/jobs/:jobId/results?json=1 to get the items
   array. While that loads, shows a skeleton with the summary stats the
   parent already has. Once items arrive, renders the full panel.

   Read-only: no further server calls except downloads (GET hrefs).
   All filtering/sorting/copy happens client-side on the items array.

   ─── Why client-side filtering ───
   Bulk jobs are capped at 10k phone / 50k email. JSON for that scale
   fits in browser memory easily, sorts in <100ms, filters in <30ms.
   No need for server-side pagination.

   ─── Clipboard contract ───
   Primary action puts the deliverable list on clipboard as one value
   per line. Falls back to a hidden textarea + execCommand for browsers
   without Clipboard API.

   ─── Error-aware design ───
   Errors are NOT verdicts - they mean "we could not verify, infrastructure
   issue". Old EmailVerifier UI buried errors in a footnote and computed
   list-health from total rows including errors, producing dishonest
   "Healthy" verdicts when 100% of rows had errored. Fixed here:
     - List health is computed against verdict total (valid+risky+invalid)
     - Health panel suppresses entirely when verdict total is 0
     - Errors get their own filter tab and warning banner when present
     - Headline language acknowledges errors explicitly
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useCallback } from 'react';
import styles from '~/styles/modules/tools/BulkVerificationResult.module.css';
import { formatInt } from '~/utils/format';

/* ═══════════════════════════════════════════════════════════════════════════
   ICONS - inline, no library
   ═══════════════════════════════════════════════════════════════════════════ */

function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ size = 12, dir = 'down' }) {
  const rot = dir === 'up' ? 'rotate(180deg)' : 'rotate(0deg)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: rot }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TYPE-AWARE CONFIG
   One config object per type drives all label/copy/column differences.
   Adding a new verifier type means: add an entry, no other code changes.
   ═══════════════════════════════════════════════════════════════════════════ */

const TYPE_CONFIG = {
  phone: {
    primaryBucket:    'mobile',          // the "deliverable" bucket
    primaryLabel:     'mobile',          // singular noun for headlines/buttons
    primaryLabelPlural: 'mobile numbers',
    rowNoun:          'numbers',
    deliveryVerb:     'can receive SMS',
    tabs: [
      { key: 'mobile',  label: 'Mobile',          dotClass: 'dotMobile' },
      { key: 'risky',   label: 'Landline / VoIP', dotClass: 'dotRisky' },
      { key: 'invalid', label: 'Invalid',         dotClass: 'dotInvalid' },
    ],
    columns: ['number', 'type', 'carrier', 'sms'],
    columnHeaders: { number: 'Number', type: 'Type', carrier: 'Carrier', sms: 'SMS' },
    txtFilenameHint: 'numbers',
    cleanCsvLabel:   'mobile-only list',
    showHealth:      false,    // health verdict is email-specific
    showCarrierRollup: true,
  },
  email: {
    primaryBucket:    'valid',
    primaryLabel:     'valid',
    primaryLabelPlural: 'valid emails',
    rowNoun:          'emails',
    deliveryVerb:     'are deliverable',
    tabs: [
      { key: 'valid',   label: 'Valid',   dotClass: 'dotValid' },
      { key: 'risky',   label: 'Risky',   dotClass: 'dotRisky' },
      { key: 'invalid', label: 'Invalid', dotClass: 'dotInvalid' },
      { key: 'unknown', label: 'Unknown', dotClass: 'dotUnknown' },
    ],
    columns: ['email', 'type', 'reason'],
    columnHeaders: { email: 'Email', type: 'Status', reason: 'Reason / SMTP' },
    txtFilenameHint: 'emails',
    cleanCsvLabel:   'valid-only list',
    showHealth:      true,
    showCarrierRollup: false,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function normalizeItem(raw, type) {
  const base = {
    rowIndex:      raw.rowIndex ?? raw.row_index ?? 0,
    status:        raw.status || 'unknown',
    category:      raw.category || null,
    subcategory:   raw.subcategory || null,
    errorCode:     raw.errorCode || raw.error_code || null,
  };
  if (type === 'phone') {
    return {
      ...base,
      input:         raw.input || raw.number || '',
      e164:          raw.e164 || null,
      country:       raw.country || null,
      lineType:      raw.lineType || raw.line_type || null,
      lineTypeLabel: raw.lineTypeLabel || raw.line_type_label || null,
      carrier:       raw.carrier || null,
      smsCapable:    raw.smsCapable === true || raw.sms_capable === true || raw.sms_capable === 'Y',
    };
  }
  // email
  return {
    ...base,
    input:         raw.email || raw.input || '',
    smtpResponse:  raw.smtpResponse || raw.smtp_response || null,
  };
}

/**
 * Bucket items into customer-facing categories. Errors get their own
 * bucket - they are NOT verdicts, they mean "infrastructure failed and
 * we could not classify".
 */
function bucketCategory(item, type) {
  if (item.status === 'error') return 'error';
  if (type === 'phone') {
    if (item.category === 'valid')   return 'mobile';
    if (item.category === 'risky')   return 'risky';
    if (item.category === 'invalid') return 'invalid';
    return 'unknown';
  }
  // email
  if (item.category === 'valid')   return 'valid';
  if (item.category === 'risky')   return 'risky';
  if (item.category === 'invalid') return 'invalid';
  return 'unknown';
}

/**
 * Plain-English headline. Type-aware. Always acknowledges errors when
 * present so the user knows their list is incomplete.
 */
function buildHeadline(counts, total, type) {
  const cfg = TYPE_CONFIG[type];
  const errs = counts.error || 0;
  const verdictTotal =
    (counts.valid || 0) + (counts.risky || 0) + (counts.invalid || 0) +
    (counts.unknown || 0) + (counts.mobile || 0);

  if (total === 0) return `No ${cfg.rowNoun} processed`;

  // 100% errors - the situation that broke the old EmailVerifier UI
  if (errs === total) {
    return `All ${formatInt(total)} ${cfg.rowNoun} hit infrastructure errors`;
  }

  // Mixed - lead with deliverable count, then breakdown
  const primary = counts[cfg.primaryBucket] || 0;
  const parts = [];

  if (primary > 0) parts.push(`${formatInt(primary)} ${cfg.primaryLabel}`);

  if (type === 'phone') {
    if (counts.risky > 0)   parts.push(`${formatInt(counts.risky)} landline`);
    if (counts.invalid > 0) parts.push(`${formatInt(counts.invalid)} invalid`);
  } else {
    if (counts.risky > 0)   parts.push(`${formatInt(counts.risky)} risky`);
    if (counts.invalid > 0) parts.push(`${formatInt(counts.invalid)} invalid`);
    if (counts.unknown > 0) parts.push(`${formatInt(counts.unknown)} unknown`);
  }
  if (errs > 0) parts.push(`${formatInt(errs)} errored`);

  if (parts.length === 0) return `${formatInt(total)} ${cfg.rowNoun} processed`;

  // Special case: all rows are deliverable
  if (verdictTotal > 0 && primary === verdictTotal && errs === 0) {
    return `All ${formatInt(total)} ${cfg.rowNoun} ${cfg.deliveryVerb}`;
  }

  return parts.join(' · ');
}

/**
 * Compute list health. Email-specific (phone uses different mental model).
 *
 * Returns null when there's no verdict-able data - prevents the old bug
 * where 100% errors produced a "Healthy" verdict because invalidPct was 0.
 */
function getListHealth(counts) {
  const verdictTotal =
    (counts.valid || 0) + (counts.risky || 0) +
    (counts.invalid || 0) + (counts.unknown || 0);

  // No usable verdicts - suppress the panel entirely.
  if (verdictTotal === 0) return null;

  const invalidPct = ((counts.invalid || 0) / verdictTotal) * 100;
  const riskyPct   = ((counts.risky   || 0) / verdictTotal) * 100;

  // Combine invalid + risky for the verdict; both are deliverability risks.
  const riskPct = invalidPct + (riskyPct * 0.5); // weight risky at half

  if (riskPct <= 2) {
    return {
      verdict: 'Healthy',
      cls: 'healthHealthy',
      message: `Of ${formatInt(verdictTotal)} verdicts, only ${invalidPct.toFixed(1)}% are invalid. Safe to send.`,
    };
  }
  if (riskPct <= 5) {
    return {
      verdict: 'Acceptable',
      cls: 'healthAcceptable',
      message: `${invalidPct.toFixed(1)}% invalid. Consider removing them before sending.`,
    };
  }
  if (riskPct <= 10) {
    return {
      verdict: 'Needs cleaning',
      cls: 'healthWarning',
      message: `${invalidPct.toFixed(1)}% invalid. Send rate above this hurts your sender reputation.`,
    };
  }
  return {
    verdict: 'Dangerous',
    cls: 'healthDanger',
    message: `${invalidPct.toFixed(1)}% invalid. Do not send to this list. Clean it first.`,
  };
}

function buildCarrierRollup(items, limit = 5) {
  const tally = new Map();
  for (const item of items) {
    if (!item.carrier) continue;
    tally.set(item.carrier, (tally.get(item.carrier) || 0) + 1);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => ({ name, n }));
}

async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function flagUrl(code) {
  if (!code || typeof code !== 'string' || code.length !== 2) return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function emailSubcategoryLabel(sub) {
  if (!sub) return '';
  const map = {
    catchall:      'Catch-all',
    disposable:    'Disposable',
    role:          'Role',
    free_provider: 'Free',
    syntax:        'Syntax',
    no_mx:         'No MX',
    mailbox:       'Mailbox',
    greylist:      'Greylisted',
  };
  return map[sub] || sub;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function BulkVerificationResult({
  type = 'email',
  jobId,
  totalRows,
  processedRows,
  status,
  durationMs,
  creditsRefunded,
  countsHint = null,
  onNewJob,
  onBackToSingle,
  toolChainHref = null,           // e.g. "/smtp-test" for email when health is good
  toolChainLabel = null,          // e.g. "Test your SMTP connection"
  toolChainBadge = null,          // e.g. "SMTP Tester"
}) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.email;

  const [items, setItems]     = useState(null);
  const [loadError, setError] = useState('');
  const [activeTab, setTab]   = useState(cfg.primaryBucket);
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState('rowIndex');
  const [sortDir, setSortDir] = useState('asc');
  const [copyState, setCopyState] = useState({});

  /* ── Load items ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/results?json=1`);
        if (!res.ok) {
          if (cancelled) return;
          setError(`Could not load results (${res.status})`);
          setItems([]);
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        const arr = Array.isArray(body?.items) ? body.items : [];
        setItems(arr.map((raw) => normalizeItem(raw, type)));
      } catch {
        if (!cancelled) {
          setError('Could not load results');
          setItems([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [jobId, type]);

  /* ── Counts (real, from items, fall back to hint while loading) ── */
  const counts = useMemo(() => {
    const base = { mobile: 0, valid: 0, risky: 0, invalid: 0, unknown: 0, error: 0 };
    if (!items) return countsHint ? { ...base, ...countsHint } : base;
    for (const item of items) {
      const b = bucketCategory(item, type);
      base[b] = (base[b] || 0) + 1;
    }
    return base;
  }, [items, countsHint, type]);

  const headline   = useMemo(() => buildHeadline(counts, items?.length ?? totalRows ?? 0, type), [counts, items, totalRows, type]);
  const carriers   = useMemo(() => cfg.showCarrierRollup ? buildCarrierRollup(items || []) : [], [items, cfg.showCarrierRollup]);
  const health     = useMemo(() => cfg.showHealth ? getListHealth(counts) : null, [counts, cfg.showHealth]);
  const errorCount = counts.error || 0;
  const totalItems = items?.length || 0;

  /* ── Filter + sort ── */
  const filtered = useMemo(() => {
    if (!items) return [];
    const filterFn =
      activeTab === 'all'   ? () => true :
      activeTab === 'error' ? (i) => bucketCategory(i, type) === 'error' :
                              (i) => bucketCategory(i, type) === activeTab;
    const out = items.filter(filterFn);
    out.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [items, activeTab, sortKey, sortDir, type]);

  const visibleRows = useMemo(
    () => showAll ? filtered : filtered.slice(0, 50),
    [filtered, showAll],
  );

  /* ── Copy actions ── */
  const flashCopied = useCallback((key) => {
    setCopyState((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopyState((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 1800);
  }, []);

  // Resolve the per-item "value to copy" (E.164 for phone, email string for email).
  const itemValue = useCallback((item) => {
    if (type === 'phone') return item.e164 || item.input;
    return item.input;
  }, [type]);

  const copyPrimary = useCallback(async () => {
    const list = (items || [])
      .filter((i) => bucketCategory(i, type) === cfg.primaryBucket)
      .map(itemValue)
      .filter(Boolean)
      .join('\n');
    if (!list) return;
    if (await copyToClipboard(list)) flashCopied('primary');
  }, [items, type, cfg.primaryBucket, itemValue, flashCopied]);

  const copyAll = useCallback(async () => {
    const list = (items || []).map(itemValue).filter(Boolean).join('\n');
    if (!list) return;
    if (await copyToClipboard(list)) flashCopied('all');
  }, [items, itemValue, flashCopied]);

  const copyFiltered = useCallback(async () => {
    const list = filtered.map(itemValue).filter(Boolean).join('\n');
    if (!list) return;
    if (await copyToClipboard(list)) flashCopied('filtered');
  }, [filtered, itemValue, flashCopied]);

  const copyErrors = useCallback(async () => {
    const list = (items || [])
      .filter((i) => i.status === 'error')
      .map(itemValue)
      .filter(Boolean)
      .join('\n');
    if (!list) return;
    if (await copyToClipboard(list)) flashCopied('errors');
  }, [items, itemValue, flashCopied]);

  const copyOne = useCallback(async (item) => {
    const value = itemValue(item);
    if (!value) return;
    if (await copyToClipboard(value)) flashCopied(`row-${item.rowIndex}`);
  }, [itemValue, flashCopied]);

  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const sortIndicator = (key) =>
    sortKey === key ? <ChevronIcon size={10} dir={sortDir === 'asc' ? 'down' : 'up'} /> : null;

  /* ── Loading skeleton ── */
  if (items === null) {
    return (
      <div className={styles.root}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonHeadline} />
          <div className={styles.skeletonStats}>
            <div className={styles.skeletonStat} />
            <div className={styles.skeletonStat} />
            <div className={styles.skeletonStat} />
          </div>
          <div className={styles.skeletonTable} />
        </div>
      </div>
    );
  }

  /* ── Render ── */
  const showHowMany = filtered.length > 50 && !showAll
    ? `Showing 50 of ${formatInt(filtered.length)}`
    : null;

  const statusBadge =
    status === 'cancelled' ? { label: 'Cancelled',    cls: styles.statusCancelled } :
    status === 'partial'   ? { label: 'With errors',  cls: styles.statusPartial } :
    status === 'failed'    ? { label: 'Failed',       cls: styles.statusFailed } :
    errorCount === totalItems && totalItems > 0
                           ? { label: 'All errored',  cls: styles.statusFailed } :
                             { label: 'Complete',     cls: styles.statusComplete };

  const primaryCount = counts[cfg.primaryBucket] || 0;

  return (
    <div className={styles.root}>
      {/* ─── HERO ─── */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroBadgeRow}>
            <span className={`${styles.statusBadge} ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            <span className={styles.heroMeta}>
              {formatInt(processedRows) || formatInt(totalItems)} processed
              {durationMs && ` · ${formatDuration(durationMs)}`}
            </span>
          </div>
          <h2 className={styles.headline}>{headline}</h2>
          {carriers.length > 0 && (
            <p className={styles.carriers}>
              <span className={styles.carriersLabel}>Carriers:</span>
              {carriers.map((c, idx) => (
                <span key={c.name} className={styles.carrierChip}>
                  {c.name} <span className={styles.carrierCount}>{c.n}</span>
                  {idx < carriers.length - 1 && <span className={styles.carrierSep}>·</span>}
                </span>
              ))}
            </p>
          )}
          {creditsRefunded > 0 && (
            <p className={styles.refundNote}>
              Refunded {formatInt(creditsRefunded)} credits for unprocessed {cfg.rowNoun}
            </p>
          )}
          {loadError && <p className={styles.errorNote}>{loadError}</p>}
        </div>
      </div>

      {/* ─── ALL-ERRORED BANNER (the bug case from the screenshot) ─── */}
      {errorCount > 0 && errorCount === totalItems && totalItems > 0 && (
        <div className={styles.allErrorsBanner}>
          <span className={styles.allErrorsIcon}><WarningIcon size={20} /></span>
          <div className={styles.allErrorsBody}>
            <p className={styles.allErrorsTitle}>None of your {cfg.rowNoun} could be verified</p>
            <p className={styles.allErrorsText}>
              All {formatInt(totalItems)} hit an infrastructure failure. The verification network
              may be temporarily unavailable. Your credits were not consumed for failed verifications -
              you can retry safely.
            </p>
            <div className={styles.allErrorsActions}>
              <button className={styles.allErrorsCopyBtn} onClick={copyErrors} type="button">
                {copyState.errors ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copyState.errors ? 'Copied' : `Copy ${formatInt(errorCount)} ${cfg.rowNoun} for retry`}
              </button>
              <button className={styles.allErrorsRetryBtn} onClick={onNewJob} type="button">
                Start a new job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── HEALTH (email only, suppressed when no verdicts) ─── */}
      {health && (
        <div className={`${styles.healthCard} ${styles[health.cls]}`}>
          <span className={styles.healthVerdict}>List health: {health.verdict}</span>
          <p className={styles.healthMessage}>{health.message}</p>
        </div>
      )}

      {/* ─── PARTIAL ERRORS NOTICE (errors but not all) ─── */}
      {errorCount > 0 && errorCount < totalItems && (
        <div className={styles.partialErrorsNotice}>
          <span className={styles.partialErrorsIcon}><WarningIcon size={14} /></span>
          <span className={styles.partialErrorsText}>
            {formatInt(errorCount)} {cfg.rowNoun} could not be verified due to infrastructure issues.
            Filter to &ldquo;Errored&rdquo; below to copy them and retry later.
          </span>
        </div>
      )}

      {/* ─── PRIMARY ACTION (clipboard-first) ─── */}
      {primaryCount > 0 && (
        <div className={styles.primaryAction}>
          <button
            className={`${styles.copyPrimaryBtn} ${copyState.primary ? styles.copyPrimaryBtnSuccess : ''}`}
            onClick={copyPrimary}
            type="button"
          >
            <span className={styles.copyPrimaryIcon}>
              {copyState.primary ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
            </span>
            <span className={styles.copyPrimaryText}>
              {copyState.primary ? 'Copied to clipboard' : `Copy ${formatInt(primaryCount)} ${cfg.primaryLabelPlural}`}
            </span>
            <span className={styles.copyPrimaryHint}>
              {copyState.primary
                ? (type === 'phone' ? 'Paste into your SMS sender' : 'Paste into your email sender')
                : 'One per line, ready to paste'}
            </span>
          </button>
        </div>
      )}

      {/* ─── FILTER TABS ─── */}
      <div className={styles.tabs} role="tablist">
        {cfg.tabs.map((t) => (
          <FilterTab
            key={t.key}
            active={activeTab === t.key}
            onClick={() => { setTab(t.key); setShowAll(false); }}
            label={t.label}
            count={counts[t.key] || 0}
            dot={styles[t.dotClass]}
          />
        ))}
        {errorCount > 0 && (
          <FilterTab
            active={activeTab === 'error'}
            onClick={() => { setTab('error'); setShowAll(false); }}
            label="Errored"
            count={errorCount}
            dot={styles.dotError}
          />
        )}
        <FilterTab
          active={activeTab === 'all'}
          onClick={() => { setTab('all'); setShowAll(false); }}
          label="All"
          count={totalItems}
        />
      </div>

      {/* ─── TABLE / CARDS ─── */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No {activeTab === 'all' ? cfg.rowNoun : activeTab + ' ' + cfg.rowNoun} in this list.</p>
          {activeTab !== 'all' && totalItems > 0 && (
            <button className={styles.emptyCta} onClick={() => setTab('all')} type="button">
              View all {formatInt(totalItems)} {cfg.rowNoun}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thStatus}></th>
                  {type === 'phone' ? (
                    <>
                      <th
                        className={`${styles.thNumber} ${styles.thSortable}`}
                        onClick={() => handleSort('e164')}
                      >
                        Number {sortIndicator('e164')}
                      </th>
                      <th className={styles.thType}>Type</th>
                      <th
                        className={`${styles.thCarrier} ${styles.thSortable}`}
                        onClick={() => handleSort('carrier')}
                      >
                        Carrier {sortIndicator('carrier')}
                      </th>
                      <th className={styles.thSms}>SMS</th>
                    </>
                  ) : (
                    <>
                      <th
                        className={`${styles.thNumber} ${styles.thSortable}`}
                        onClick={() => handleSort('input')}
                      >
                        Email {sortIndicator('input')}
                      </th>
                      <th className={styles.thType}>Status</th>
                      <th className={styles.thCarrier}>Reason / SMTP</th>
                    </>
                  )}
                  <th className={styles.thAction}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => (
                  <ResultRow
                    key={item.rowIndex}
                    item={item}
                    type={type}
                    onCopy={() => copyOne(item)}
                    copied={!!copyState[`row-${item.rowIndex}`]}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList}>
            {visibleRows.map((item) => (
              <ResultCard
                key={item.rowIndex}
                item={item}
                type={type}
                onCopy={() => copyOne(item)}
                copied={!!copyState[`row-${item.rowIndex}`]}
              />
            ))}
          </div>

          {showHowMany && (
            <div className={styles.showMoreRow}>
              <span className={styles.showMoreText}>{showHowMany}</span>
              <button className={styles.showMoreBtn} onClick={() => setShowAll(true)} type="button">
                Show all {formatInt(filtered.length)}
              </button>
            </div>
          )}
          {showAll && filtered.length > 50 && (
            <div className={styles.showMoreRow}>
              <button className={styles.showMoreBtn} onClick={() => setShowAll(false)} type="button">
                Show less
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── EXPORTS ─── */}
      {totalItems > 0 && (
        <div className={styles.exportPanel}>
          <h3 className={styles.exportTitle}>Get your data out</h3>
          <p className={styles.exportSubtitle}>Pick the format that fits where you&rsquo;re sending these {cfg.rowNoun}.</p>

          <div className={styles.exportGrid}>
            {activeTab !== cfg.primaryBucket && filtered.length > 0 && (
              <button className={styles.exportBtn} onClick={copyFiltered} type="button">
                <span className={styles.exportBtnIcon}>
                  {copyState.filtered ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                </span>
                <span className={styles.exportBtnLabel}>
                  {copyState.filtered ? 'Copied' : `Copy ${formatInt(filtered.length)} filtered`}
                </span>
                <span className={styles.exportBtnHint}>To clipboard, one per line</span>
              </button>
            )}

            <button className={styles.exportBtn} onClick={copyAll} type="button">
              <span className={styles.exportBtnIcon}>
                {copyState.all ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              </span>
              <span className={styles.exportBtnLabel}>
                {copyState.all ? 'Copied' : `Copy all ${formatInt(totalItems)}`}
              </span>
              <span className={styles.exportBtnHint}>To clipboard, one per line</span>
            </button>

            {primaryCount > 0 && (
              <a className={styles.exportBtn} href={`/api/jobs/${jobId}/results?clean=1&format=txt`} download>
                <span className={styles.exportBtnIcon}><DownloadIcon size={16} /></span>
                <span className={styles.exportBtnLabel}>Download {cfg.primaryLabel}.txt</span>
                <span className={styles.exportBtnHint}>{formatInt(primaryCount)} {cfg.rowNoun}, plain text</span>
              </a>
            )}

            <a className={styles.exportBtn} href={`/api/jobs/${jobId}/results?format=txt`} download>
              <span className={styles.exportBtnIcon}><DownloadIcon size={16} /></span>
              <span className={styles.exportBtnLabel}>Download all.txt</span>
              <span className={styles.exportBtnHint}>{formatInt(totalItems)} {cfg.rowNoun}, plain text</span>
            </a>

            <a className={styles.exportBtn} href={`/api/jobs/${jobId}/results`} download>
              <span className={styles.exportBtnIcon}><DownloadIcon size={16} /></span>
              <span className={styles.exportBtnLabel}>Download results.csv</span>
              <span className={styles.exportBtnHint}>Full data with all fields</span>
            </a>
          </div>
        </div>
      )}

      {/* ─── TOOL CHAIN UPSELL (caller decides; only shown on success) ─── */}
      {toolChainHref && health?.cls === 'healthHealthy' && primaryCount > 0 && (
        <a href={toolChainHref} className={styles.toolChain}>
          <span className={styles.toolChainText}>{toolChainLabel}</span>
          <span className={styles.toolChainArrow}>{'\u2192'}</span>
          {toolChainBadge && <span className={styles.toolChainBadge}>{toolChainBadge}</span>}
        </a>
      )}

      {/* ─── FOOTER ACTIONS ─── */}
      <div className={styles.footerActions}>
        <button className={styles.newJobBtn} onClick={onNewJob} type="button">
          New bulk job
        </button>
        {onBackToSingle && (
          <button className={styles.backBtn} onClick={onBackToSingle} type="button">
            Back to single verification
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function FilterTab({ active, onClick, label, count, dot }) {
  return (
    <button
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={onClick}
      role="tab"
      aria-selected={active}
      type="button"
    >
      {dot && <span className={`${styles.tabDot} ${dot}`} />}
      <span className={styles.tabLabel}>{label}</span>
      <span className={styles.tabCount}>{formatInt(count)}</span>
    </button>
  );
}

function ResultRow({ item, type, onCopy, copied }) {
  const bucket = bucketCategory(item, type);
  const dotClass =
    bucket === 'mobile'  || bucket === 'valid' ? styles.dotMobile  :
    bucket === 'risky'                          ? styles.dotRisky   :
    bucket === 'invalid'                        ? styles.dotInvalid :
    bucket === 'error'                          ? styles.dotError   :
                                                  styles.dotUnknown;

  return (
    <tr>
      <td className={styles.tdStatus}>
        <span className={`${styles.dot} ${dotClass}`} />
      </td>
      {type === 'phone' ? (
        <>
          <td className={styles.tdNumber}>
            {item.country && flagUrl(item.country) && (
              <img src={flagUrl(item.country)} alt="" className={styles.rowFlag} />
            )}
            <span className={styles.numberText}>{item.e164 || item.input}</span>
          </td>
          <td className={styles.tdType}>
            <TypeBadge bucket={bucket} label={item.lineTypeLabel || labelFromBucket(bucket, type)} />
          </td>
          <td className={styles.tdCarrier}>
            {item.carrier || <span className={styles.dim}>-</span>}
          </td>
          <td className={styles.tdSms}>
            {item.smsCapable
              ? <span className={styles.smsYes}>Yes</span>
              : <span className={styles.smsNo}>No</span>}
          </td>
        </>
      ) : (
        <>
          <td className={styles.tdNumber}>
            <span className={styles.numberText}>{item.input}</span>
          </td>
          <td className={styles.tdType}>
            <TypeBadge bucket={bucket} label={labelFromBucket(bucket, type)} />
            {item.subcategory && (
              <span className={styles.subBadge}>{emailSubcategoryLabel(item.subcategory)}</span>
            )}
          </td>
          <td className={styles.tdCarrier}>
            {item.errorCode
              ? <span className={styles.errCode}>{item.errorCode}</span>
              : item.smtpResponse
                ? <span className={styles.smtpResp}>{item.smtpResponse}</span>
                : <span className={styles.dim}>-</span>}
          </td>
        </>
      )}
      <td className={styles.tdAction}>
        <button
          className={`${styles.rowCopyBtn} ${copied ? styles.rowCopyBtnSuccess : ''}`}
          onClick={onCopy}
          aria-label={`Copy ${type === 'phone' ? (item.e164 || item.input) : item.input}`}
          type="button"
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
        </button>
      </td>
    </tr>
  );
}

function ResultCard({ item, type, onCopy, copied }) {
  const bucket = bucketCategory(item, type);
  const dotClass =
    bucket === 'mobile'  || bucket === 'valid' ? styles.dotMobile  :
    bucket === 'risky'                          ? styles.dotRisky   :
    bucket === 'invalid'                        ? styles.dotInvalid :
    bucket === 'error'                          ? styles.dotError   :
                                                  styles.dotUnknown;

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={`${styles.dot} ${dotClass}`} />
        {type === 'phone' && item.country && flagUrl(item.country) && (
          <img src={flagUrl(item.country)} alt="" className={styles.rowFlag} />
        )}
        <span className={styles.cardNumber}>
          {type === 'phone' ? (item.e164 || item.input) : item.input}
        </span>
        <button
          className={`${styles.rowCopyBtn} ${copied ? styles.rowCopyBtnSuccess : ''}`}
          onClick={onCopy}
          aria-label="Copy"
          type="button"
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
        </button>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardField}>
          <span className={styles.cardFieldLabel}>{type === 'phone' ? 'Type' : 'Status'}</span>
          <TypeBadge bucket={bucket} label={labelFromBucket(bucket, type)} />
        </div>
        {type === 'phone' && item.carrier && (
          <div className={styles.cardField}>
            <span className={styles.cardFieldLabel}>Carrier</span>
            <span className={styles.cardFieldValue}>{item.carrier}</span>
          </div>
        )}
        {type === 'phone' && (
          <div className={styles.cardField}>
            <span className={styles.cardFieldLabel}>SMS</span>
            {item.smsCapable
              ? <span className={styles.smsYes}>Yes</span>
              : <span className={styles.smsNo}>No</span>}
          </div>
        )}
        {type === 'email' && item.subcategory && (
          <div className={styles.cardField}>
            <span className={styles.cardFieldLabel}>Subtype</span>
            <span className={styles.cardFieldValue}>{emailSubcategoryLabel(item.subcategory)}</span>
          </div>
        )}
        {type === 'email' && (item.errorCode || item.smtpResponse) && (
          <div className={styles.cardField}>
            <span className={styles.cardFieldLabel}>Reason</span>
            <span className={styles.cardFieldValue}>
              {item.errorCode || item.smtpResponse}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ bucket, label }) {
  const cls =
    bucket === 'mobile' || bucket === 'valid' ? styles.typeMobile  :
    bucket === 'risky'                         ? styles.typeRisky   :
    bucket === 'invalid'                       ? styles.typeInvalid :
    bucket === 'error'                         ? styles.typeError   :
                                                 styles.typeUnknown;
  return <span className={`${styles.typeBadge} ${cls}`}>{label}</span>;
}

function labelFromBucket(b, type) {
  if (type === 'phone') {
    if (b === 'mobile')  return 'Mobile';
    if (b === 'risky')   return 'Landline/VoIP';
    if (b === 'invalid') return 'Invalid';
    if (b === 'error')   return 'Error';
    return 'Unknown';
  }
  if (b === 'valid')   return 'Valid';
  if (b === 'risky')   return 'Risky';
  if (b === 'invalid') return 'Invalid';
  if (b === 'error')   return 'Error';
  return 'Unknown';
}
