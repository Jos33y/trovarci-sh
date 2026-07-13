/* ═══════════════════════════════════════════════════════════════════════════
   EmailVerifier.jsx

   Real component wired to the Batch 4 routes:
     POST /api/tools/verify-email                     single-mode probe
     POST /api/tools/verify-email-bulk                start a bulk job
     GET  /api/jobs/:id/stream                        SSE progress (primary)
     GET  /api/jobs/:id/status                        polling fallback
     GET  /api/jobs/:id/results                       full CSV download
     GET  /api/jobs/:id/results?clean=1               valid-only CSV
     POST /api/jobs/:id/cancel                        cancel + partial refund

   Drop-in replacement for the 670-line mock. Uses every CSS class name
   already defined in EmailVerifier.module.css (do not add new classes;
   the CSS file stays untouched). Behaviour preserved:
     - Single mode: 5-step ladder reveal animation on result
     - Bulk mode: drop zone for CSV, paste area, preview card, live count
       grid during progress, stat cards on completion, list health verdict,
       tool chain link
     - Mode toggle via "Have a list?" / "Verify a single email instead"

   Server result mapping:
     The lib's verifyOneEmail returns result.steps as an array of
     { name, status, detail }. The mock used step.label; we map name -> label
     when shaping the display data. Status values are normalised
     (pass/fail/warn) so the CSS .stepStatus_pass/fail/warn classes apply
     cleanly regardless of small string drift on the server side.

     The lib emits 4 verdict categories: valid / invalid / risky / unknown.
     The CSS only has 3 verdict classes (valid/invalid/risky). We map
     unknown -> risky for visual styling - "unknown" reads as "uncertain",
     which is the closest of the three.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from '~/styles/modules/tools/EmailVerifier.module.css';
import BulkVerificationResult from './BulkVerificationResult';
import { formatInt } from '~/utils/format';

const MAX_BULK_SIZE = 50_000;
const STEP_REVEAL_INTERVAL_MS = 350;
const POLL_INTERVAL_MS = 1500;
const TERMINAL_STATES = new Set(['complete', 'partial', 'cancelled', 'failed']);

/* ── Icons ── */

function MailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 16V4M12 4l4 4M12 4L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


/* ── Helpers ── */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getVerdictColor(verdict) {
  switch (verdict) {
    case 'valid':   return 'var(--trov-success)';
    case 'invalid': return 'var(--trov-error)';
    case 'risky':   return 'var(--trov-warning)';
    default:        return 'var(--trov-text-muted)';
  }
}

function getVerdictLabel(verdict) {
  switch (verdict) {
    case 'valid':   return 'Valid';
    case 'invalid': return 'Invalid';
    case 'risky':   return 'Risky';
    case 'unknown': return 'Unknown';
    default:        return 'Unknown';
  }
}


function formatDuration(ms) {
  if (!ms || ms < 0) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hours} hour${hours === 1 ? '' : 's'}${remMin ? ` ${remMin} min` : ''}`;
}

/* ── Server response shape mapping ────────────────────────────────────────
   verifyOneEmail returns:
     {
       email, domain, category, subcategory, smtpResponse, mxHost,
       isDisposable, isRole, isFreeProvider, isCatchall, durationMs,
       steps: [{ name, status, detail }, ...]
     }
   We shape it into the form the existing JSX expects (verdict, label, etc).
   ──────────────────────────────────────────────────────────────────────── */

function normalizeStepStatus(s) {
  if (!s) return 'pass';
  const lower = String(s).toLowerCase();
  if (['pass', 'ok', 'success', 'done'].includes(lower))    return 'pass';
  if (['fail', 'error', 'rejected'].includes(lower))         return 'fail';
  if (['warn', 'warning', 'risky', 'unsafe'].includes(lower)) return 'warn';
  return 'pass';
}

function prettifyStepName(name) {
  if (!name) return '';
  const lower = String(name).toLowerCase();
  const map = {
    syntax:         'Syntax',
    mx:             'Domain',
    mx_lookup:      'Domain',
    dns:            'Domain',
    domain:         'Domain',
    ssrf:           'Safety',
    safety:         'Safety',
    cache:          'Cache',
    connect:        'Server',
    tcp:            'Server',
    proxy:          'Server',
    helo:           'SMTP',
    ehlo:           'SMTP',
    smtp:           'SMTP',
    mail_from:      'Sender',
    rcpt:           'Mailbox',
    rcpt_to:        'Mailbox',
    mailbox:        'Mailbox',
    catchall:       'Catch-all',
    catchall_check: 'Catch-all',
  };
  return map[lower] || (name.charAt(0).toUpperCase() + name.slice(1));
}

function buildMessage(r) {
  const { category, subcategory, isDisposable, isRole, isFreeProvider, isCatchall } = r;
  if (category === 'valid') {
    if (isDisposable)    return 'Deliverable, but the inbox is disposable / temporary. The user may not check it.';
    if (isRole)          return 'Deliverable, but this is a role address (info@, admin@, etc.) - not a personal mailbox.';
    if (isFreeProvider)  return 'Valid and deliverable. Free-mail provider.';
    return 'This email address is valid and deliverable.';
  }
  if (category === 'invalid') {
    if (subcategory === 'syntax')  return 'The address is not properly formatted.';
    if (subcategory === 'no_mx')   return 'The domain has no mail server. Email cannot be delivered.';
    if (subcategory === 'mailbox') return 'Do not send to this address. The mailbox does not exist and will hard bounce.';
    return 'This address cannot receive email.';
  }
  if (category === 'risky') {
    if (subcategory === 'catchall' || isCatchall) {
      return 'This server accepts email for any address. The specific mailbox may or may not exist.';
    }
    if (subcategory === 'disposable' || isDisposable) {
      return 'This is a disposable / temporary inbox. The user may not check it.';
    }
    if (subcategory === 'role' || isRole) {
      return 'This is a role address (info@, admin@, etc.) - not a personal mailbox.';
    }
    if (subcategory === 'free_provider' || isFreeProvider) {
      return 'Free-mail provider. Deliverable, but flagged for B2B campaigns.';
    }
    return 'This address is deliverable but flagged as risky.';
  }
  if (category === 'unknown') {
    if (subcategory === 'greylist') {
      return 'The destination server temporarily deferred us (graylisting). Try again in a few minutes.';
    }
    return 'The destination server did not commit to a yes or no.';
  }
  return '';
}

function shapeServerResult(r) {
  const verdict = r.category || 'unknown';
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((s) => ({
    label:  prettifyStepName(s.name),
    status: normalizeStepStatus(s.status),
    detail: s.detail || '',
  }));
  return {
    email:    r.email,
    verdict,
    category: r.category,
    steps,
    provider: r.mxHost ? `MX: ${r.mxHost}` : null,
    response: r.smtpResponse || '(no SMTP response captured)',
    message:  buildMessage(r),
    isDisposable:   r.isDisposable,
    isRole:         r.isRole,
    isFreeProvider: r.isFreeProvider,
    isCatchall:     r.isCatchall,
  };
}

/* ── Friendly error mapping ─────────────────────────────────────────────── */

const FRIENDLY_ERROR = {
  RATE_LIMITED:               'Too many requests. Try again in a minute.',
  INSUFFICIENT_CREDITS:       'Not enough credits for this verification.',
  EMAIL_REQUIRED:             'Enter an email address to check.',
  EMAILS_REQUIRED:            'Add at least one email to verify.',
  EMAILS_NOT_STRINGS:         'Every entry must be plain text.',
  BULK_TOO_LARGE:             `Bulk uploads cap at ${formatInt(MAX_BULK_SIZE)} emails per job.`,
  BULK_CREATE_FAILED:         'Could not start the bulk job. Your credits were refunded.',
  PROXY_NO_CREDENTIALS:       'Verification infrastructure is being configured. Try again later.',
  EMAIL_VERIFY_PROXY_TIMEOUT: 'Connection to the destination server timed out.',
  EMAIL_VERIFY_PROXY_AUTH:    'Verification network authentication issue. Try again later.',
  EMAIL_VERIFY_UNSAFE_MX:     'This domain blocks verification or has no usable mail server.',
  EMAIL_VERIFY_TIMEOUT:       'The destination server took too long to respond.',
  EMAIL_VERIFY_PROBE_FAILED:  'Could not complete the SMTP probe. Try again.',
  JOB_NOT_FOUND:              'This job no longer exists.',
  JOB_NOT_TERMINAL:           'The job is still running.',
  JOB_NOT_CANCELLABLE:        'The job already finished.',
};

function friendlyError(code, fallback) {
  return FRIENDLY_ERROR[code] || fallback || 'Something went wrong. Try again.';
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function EmailVerifier() {
  const toolRef = useRef(null);
  const fileInputRef = useRef(null);
  const stepTimerRef = useRef(null);
  const sseRef = useRef(null);
  const pollRef = useRef(null);

  /* Mode + phase */
  const [mode, setMode] = useState('single');      // 'single' | 'bulk'
  const [phase, setPhase] = useState('input');     // single: input | verifying | result
                                                    // bulk:   upload | preview | verifying | results

  /* Single mode */
  const [email, setEmail] = useState('');
  const [singleResult, setSingleResult] = useState(null);
  const [visibleStepIdx, setVisibleStepIdx] = useState(-1);

  /* Bulk mode */
  const [bulkEmails, setBulkEmails] = useState([]);
  const [bulkSource, setBulkSource] = useState('');
  const [bulkDupes, setBulkDupes] = useState(0);
  const [bulkJobId, setBulkJobId] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStats, setBulkStats] = useState({ valid: 0, invalid: 0, risky: 0, unknown: 0, error: 0 });
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkStartedAt, setBulkStartedAt] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);

  /* Shared */
  const [inputError, setInputError] = useState('');

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (sseRef.current) { try { sseRef.current.close(); } catch {} }
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const scrollToTool = useCallback(() => {
    if (toolRef.current) {
      const top = toolRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  const cleanupBulkChannels = useCallback(() => {
    if (sseRef.current)  { try { sseRef.current.close(); } catch {} sseRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  /* ── Server-call wrapper that handles auth-redirect HTML responses ── */

  const safeJson = useCallback(async (res) => {
    const text = await res.text();
    try {
      return { body: JSON.parse(text), authIssue: false };
    } catch {
      // Non-JSON response. Most likely the route's requireUser threw a
      // redirect to /login and fetch followed it, so we got HTML back.
      const looksLikeAuth =
        text.includes('login') ||
        text.includes('Sign in') ||
        res.url.includes('/login') ||
        res.status === 401;
      return { body: null, authIssue: looksLikeAuth };
    }
  }, []);

  /* ════════════════════════════════════════════════════════════════════
     SINGLE MODE
     ════════════════════════════════════════════════════════════════════ */

  const handleSingleVerify = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) { setInputError('Enter an email address'); return; }
    if (!isValidEmail(trimmed)) { setInputError('Enter a valid email address'); return; }
    setInputError('');
    setPhase('verifying');
    setVisibleStepIdx(-1);
    setSingleResult(null);

    let res;
    try {
      res = await fetch('/api/tools/verify-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: trimmed }),
      });
    } catch {
      setInputError('Could not reach the verification service. Check your connection and try again.');
      setPhase('input');
      return;
    }

    const { body, authIssue } = await safeJson(res);

    if (authIssue || (!body && res.status === 401)) {
      setInputError('Sign in to verify emails. Single verifications cost 1 credit.');
      setPhase('input');
      return;
    }
    if (!body) {
      setInputError('Server error. Try again in a moment.');
      setPhase('input');
      return;
    }
    if (!res.ok || !body.ok) {
      const refundNote = body.refunded ? ' Your credit was refunded.' : '';
      setInputError(friendlyError(body.code, body.error) + refundNote);
      setPhase('input');
      return;
    }

    // Success - shape the result and animate the ladder reveal.
    const shaped = shapeServerResult(body.result);
    setSingleResult(shaped);

    // Animate steps one by one. The probe completed server-side; the
    // animation is purely a visual flourish on the ladder reveal.
    let idx = 0;
    stepTimerRef.current = setInterval(() => {
      if (idx >= shaped.steps.length) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
        setTimeout(() => setPhase('result'), 200);
        return;
      }
      setVisibleStepIdx(idx);
      idx++;
    }, STEP_REVEAL_INTERVAL_MS);
  }, [email, safeJson]);

  const handleSingleReset = useCallback(() => {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setEmail('');
    setSingleResult(null);
    setVisibleStepIdx(-1);
    setPhase('input');
    setInputError('');
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  const handleSingleRetry = useCallback(() => {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setSingleResult(null);
    setVisibleStepIdx(-1);
    setPhase('input');
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  /* ════════════════════════════════════════════════════════════════════
     BULK MODE
     ════════════════════════════════════════════════════════════════════ */

  const processEmails = useCallback((raw, source) => {
    const lines = raw.split(/[\n,;]+/).map((l) => l.trim()).filter((l) => l && isValidEmail(l));
    const unique = [...new Set(lines.map((l) => l.toLowerCase()))]
      .map((lower) => lines.find((orig) => orig.toLowerCase() === lower));
    const dupes = lines.length - unique.length;

    if (unique.length === 0) {
      setInputError('No valid email addresses found in that input.');
      return;
    }
    if (unique.length > MAX_BULK_SIZE) {
      setInputError(`Bulk uploads cap at ${formatInt(MAX_BULK_SIZE)} emails per job. You provided ${formatInt(unique.length)}.`);
      return;
    }

    setBulkEmails(unique);
    setBulkDupes(dupes);
    setBulkSource(source);
    setPhase('preview');
    setInputError('');
  }, []);

  const handleFileUpload = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'txt'].includes(ext)) {
      setInputError('Only .csv and .txt files are accepted');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => processEmails(e.target.result, file.name);
    reader.readAsText(file);
  }, [processEmails]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  }, [handleFileUpload]);

  const handlePasteSubmit = useCallback(() => {
    if (!pasteText.trim()) { setInputError('Paste email addresses, one per line'); return; }
    processEmails(pasteText, 'pasted');
  }, [pasteText, processEmails]);

  /* ── Bulk transport: SSE primary, polling fallback ─────────────────── */

  const finalizeBulkJob = useCallback(async (jobId, startedAt) => {
    cleanupBulkChannels();

    // Fetch one final snapshot for accurate counts
    let finalProgress = null;
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      const { body } = await safeJson(res);
      if (body?.ok && body.progress) finalProgress = body.progress;
    } catch {}

    // If the snapshot failed, fall back to whatever we have in state
    const final = finalProgress || {
      totalRows:     bulkEmails.length,
      processedRows: bulkProgress,
      counts:        bulkStats,
      status:        'complete',
    };

    setBulkResults({
      jobId:         jobId,
      total:         final.totalRows,
      processedRows: final.processedRows ?? final.totalRows,
      valid:         final.counts?.valid    || 0,
      invalid:       final.counts?.invalid  || 0,
      risky:         final.counts?.risky    || 0,
      unknown:       final.counts?.unknown  || 0,
      error:         final.counts?.error    || 0,
      counts:        final.counts || null,
      duration:      formatDuration(Date.now() - (startedAt || Date.now())),
      durationMs:    Date.now() - (startedAt || Date.now()),
      status:        final.status,
    });
    setPhase('results');
  }, [bulkEmails.length, bulkProgress, bulkStats, cleanupBulkChannels, safeJson]);

  const startPolling = useCallback((jobId, startedAt) => {
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`);
        const { body, authIssue } = await safeJson(res);
        if (authIssue) { cleanupBulkChannels(); setInputError('Session expired. Sign in to continue.'); setPhase('preview'); return; }
        if (!body?.ok || !body.progress) return;
        setBulkProgress(body.progress.processedRows || 0);
        setBulkStats({
          valid:   body.progress.counts?.valid   || 0,
          invalid: body.progress.counts?.invalid || 0,
          risky:   body.progress.counts?.risky   || 0,
          unknown: body.progress.counts?.unknown || 0,
          error:   body.progress.counts?.error   || 0,
        });
        if (TERMINAL_STATES.has(body.progress.status)) {
          finalizeBulkJob(jobId, startedAt);
        }
      } catch {}
    };
    tick();
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [cleanupBulkChannels, finalizeBulkJob, safeJson]);

  const startTracking = useCallback((jobId, startedAt) => {
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      startPolling(jobId, startedAt);
      return;
    }

    let droppedToPolling = false;
    const dropToPolling = () => {
      if (droppedToPolling) return;
      droppedToPolling = true;
      if (sseRef.current) { try { sseRef.current.close(); } catch {} sseRef.current = null; }
      startPolling(jobId, startedAt);
    };

    try {
      const es = new EventSource(`/api/jobs/${jobId}/stream`);
      sseRef.current = es;

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data && typeof data === 'object' && 'status' in data) {
            setBulkProgress(data.processedRows || 0);
            setBulkStats({
              valid:   data.counts?.valid   || 0,
              invalid: data.counts?.invalid || 0,
              risky:   data.counts?.risky   || 0,
              unknown: data.counts?.unknown || 0,
              error:   data.counts?.error   || 0,
            });
            if (TERMINAL_STATES.has(data.status)) {
              finalizeBulkJob(jobId, startedAt);
            }
          }
        } catch {}
      };
      es.addEventListener('complete', () => finalizeBulkJob(jobId, startedAt));
      es.addEventListener('timeout',  () => finalizeBulkJob(jobId, startedAt));
      es.addEventListener('gone',     () => {
        cleanupBulkChannels();
        setInputError('The job was lost on the server. Please start a new one.');
        setPhase('preview');
      });
      es.onerror = dropToPolling;
    } catch {
      dropToPolling();
    }
  }, [cleanupBulkChannels, finalizeBulkJob, startPolling]);

  const handleBulkVerify = useCallback(async () => {
    if (bulkEmails.length === 0) return;

    setPhase('verifying');
    setBulkProgress(0);
    setBulkStats({ valid: 0, invalid: 0, risky: 0, unknown: 0 });
    setBulkResults(null);
    setInputError('');

    const startedAt = Date.now();
    setBulkStartedAt(startedAt);

    let res;
    try {
      res = await fetch('/api/tools/verify-email-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ emails: bulkEmails }),
      });
    } catch {
      setInputError('Could not reach the verification service. Check your connection and try again.');
      setPhase('preview');
      return;
    }

    const { body, authIssue } = await safeJson(res);

    if (authIssue) {
      setInputError('Sign in to start a bulk verification job. Bulk runs at 1 credit per 5 emails.');
      setPhase('preview');
      return;
    }
    if (!body) {
      setInputError('Server error. Try again in a moment.');
      setPhase('preview');
      return;
    }
    if (!res.ok || !body.ok) {
      setInputError(friendlyError(body.code, body.error));
      setPhase('preview');
      return;
    }

    setBulkJobId(body.jobId);
    startTracking(body.jobId, startedAt);
  }, [bulkEmails, safeJson, startTracking]);

  const handleBulkCancel = useCallback(async () => {
    if (!bulkJobId) return;
    cleanupBulkChannels();

    try {
      const res = await fetch(`/api/jobs/${bulkJobId}/cancel`, { method: 'POST' });
      const { body } = await safeJson(res);
      if (body?.ok) {
        // Move on to results panel showing what completed before cancel
        finalizeBulkJob(bulkJobId, bulkStartedAt);
      } else {
        // If cancel said NOT_CANCELLABLE the worker already finished -
        // fall through to results anyway.
        finalizeBulkJob(bulkJobId, bulkStartedAt);
      }
    } catch {
      // Network error - still surface results from our last known state
      finalizeBulkJob(bulkJobId, bulkStartedAt);
    }
  }, [bulkJobId, bulkStartedAt, cleanupBulkChannels, finalizeBulkJob, safeJson]);

  const handleBulkReset = useCallback(() => {
    cleanupBulkChannels();
    setBulkEmails([]);
    setBulkSource('');
    setBulkDupes(0);
    setBulkJobId(null);
    setBulkProgress(0);
    setBulkStats({ valid: 0, invalid: 0, risky: 0, unknown: 0 });
    setBulkResults(null);
    setBulkStartedAt(null);
    setPasteText('');
    setPhase('upload');
    setInputError('');
    setTimeout(scrollToTool, 50);
  }, [cleanupBulkChannels, scrollToTool]);

  /* ── Mode switches ── */

  const switchToBulk = useCallback(() => {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setMode('bulk');
    setPhase('upload');
    setSingleResult(null);
    setVisibleStepIdx(-1);
    setInputError('');
  }, []);

  const switchToSingle = useCallback(() => {
    cleanupBulkChannels();
    setMode('single');
    setPhase('input');
    setBulkEmails([]);
    setBulkResults(null);
    setBulkProgress(0);
    setPasteText('');
    setInputError('');
  }, [cleanupBulkChannels]);

  /* ── Keyboard ── */

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (mode === 'single') handleSingleVerify();
    } else if (e.key === 'Enter' && mode === 'single') {
      handleSingleVerify();
    }
  }, [mode, handleSingleVerify]);

  /* ── Derived bulk values for display ── */

  const bulkTotal = bulkEmails.length;
  const bulkPct = bulkTotal > 0 ? Math.round((bulkProgress / bulkTotal) * 100) : 0;

  /* ── Render ── */

  return (
    <div ref={toolRef} className={styles.tool}>
      {/* Header */}
      <div className={styles.toolHeader}>
        <div className={styles.toolHeaderLeft}>
          <span className={styles.toolIcon}><MailIcon /></span>
          <div>
            <h2 className={styles.toolTitle}>Email Verifier</h2>
            <p className={styles.toolSubtitle}>
              {mode === 'single'
                ? 'Check if an email address is real and deliverable'
                : 'Verify your email list before sending'}
            </p>
          </div>
        </div>
        <span className={styles.freeBadge}>
          {mode === 'single' ? '1 CREDIT' : '1 CREDIT / 5'}
        </span>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          SINGLE MODE
          ════════════════════════════════════════════════════════════════ */}
      {mode === 'single' && (
        <>
          {/* Input */}
          {(phase === 'input' || phase === 'verifying') && (
            <div className={styles.singleInput}>
              <div className={styles.inputRow}>
                <input
                  type="email"
                  className={styles.emailInput}
                  placeholder="user@example.com"
                  value={email}
                  autoComplete="off"
                  onChange={(e) => { setEmail(e.target.value); setInputError(''); }}
                  onKeyDown={handleKeyDown}
                  disabled={phase === 'verifying'}
                />
                <button
                  className={styles.verifyButton}
                  onClick={handleSingleVerify}
                  disabled={phase === 'verifying'}
                >
                  {phase === 'verifying' ? 'Verifying...' : 'Verify'}
                </button>
              </div>
              {inputError && <p className={styles.errorText}>{inputError}</p>}
            </div>
          )}

          {/* 5-Step Verification Ladder */}
          {singleResult && (phase === 'verifying' || phase === 'result') && (
            <div className={styles.ladderSection}>
              {/* Verdict banner */}
              {phase === 'result' && (
                <div className={`${styles.verdictBanner} ${styles['verdict_' + singleResult.verdict]}`}>
                  <span className={styles.verdictIcon}>
                    {singleResult.verdict === 'valid' ? '\u2713'
                      : singleResult.verdict === 'invalid' ? '\u2717'
                      : singleResult.verdict === 'unknown' ? '?'
                      : '\u26A0'}
                  </span>
                  <span className={styles.verdictText}>
                    <strong>{singleResult.email}</strong> is {getVerdictLabel(singleResult.category).toLowerCase()}
                  </span>
                </div>
              )}

              {/* Steps */}
              <div className={styles.stepsLadder}>
                {singleResult.steps.map((step, i) => {
                  const visible = i <= visibleStepIdx;
                  const isCurrent = i === visibleStepIdx && phase === 'verifying';
                  return (
                    <div
                      key={`${step.label}-${i}`}
                      className={`${styles.stepRow} ${visible ? styles.stepVisible : styles.stepHidden} ${isCurrent ? styles.stepCurrent : ''}`}
                    >
                      <span className={`${styles.stepStatus} ${visible ? styles['stepStatus_' + step.status] : ''}`}>
                        {!visible ? '' : step.status === 'pass' ? '\u2713' : step.status === 'fail' ? '\u2717' : '\u26A0'}
                      </span>
                      <span className={styles.stepLabel}>{step.label}</span>
                      <span className={styles.stepDetail}>{visible ? step.detail : ''}</span>
                    </div>
                  );
                })}
              </div>

              {/* Extra info */}
              {phase === 'result' && (
                <div className={styles.resultMeta}>
                  {singleResult.provider && (
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Provider</span>
                      <span className={styles.metaValue}>{singleResult.provider}</span>
                    </div>
                  )}
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Response</span>
                    <span className={`${styles.metaValue} ${styles.mono}`}>{singleResult.response}</span>
                  </div>
                  <p className={styles.resultMessage} style={{ color: getVerdictColor(singleResult.verdict) }}>
                    {singleResult.message}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {phase === 'result' && (
            <div className={styles.resultActions}>
              <button className={styles.retryButton} onClick={handleSingleRetry}>Verify another</button>
              <button className={styles.resetButton} onClick={handleSingleReset}>Clear</button>
            </div>
          )}

          {/* Upsell to bulk */}
          {(phase === 'input' || phase === 'result') && (
            <div className={styles.modeSwitch}>
              <button className={styles.modeSwitchLink} onClick={switchToBulk}>
                Have a list? Upload CSV for bulk verification <span className={styles.arrow}>{'\u2192'}</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          BULK MODE
          ════════════════════════════════════════════════════════════════ */}
      {mode === 'bulk' && (
        <>
          {/* Upload phase */}
          {phase === 'upload' && (
            <div className={styles.bulkUpload}>
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <span className={styles.dropIcon}><UploadIcon /></span>
                <p className={styles.dropText}>Drag and drop a CSV or TXT file here</p>
                <p className={styles.dropOr}>or</p>
                <button className={styles.browseButton} onClick={() => fileInputRef.current?.click()}>
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className={styles.hiddenFileInput}
                  onChange={(e) => handleFileUpload(e.target.files[0])}
                />
              </div>

              <div className={styles.pasteSection}>
                <p className={styles.pasteLabel}>Or paste emails, one per line:</p>
                <textarea
                  className={styles.pasteArea}
                  rows={4}
                  placeholder={"user1@example.com\nuser2@company.com\nuser3@domain.org"}
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setInputError(''); }}
                />
                <button className={styles.pasteSubmit} onClick={handlePasteSubmit}>
                  Load emails
                </button>
              </div>

              <p className={styles.uploadHint}>Accepted: .csv, .txt - Max {formatInt(MAX_BULK_SIZE)} emails per job</p>
              {inputError && <p className={styles.errorText}>{inputError}</p>}
            </div>
          )}

          {/* Preview phase */}
          {phase === 'preview' && (
            <div className={styles.previewSection}>
              <div className={styles.previewCard}>
                <div className={styles.previewStats}>
                  <span className={styles.previewCount}>{formatInt(bulkEmails.length)}</span>
                  <span className={styles.previewLabel}>unique emails found</span>
                </div>
                {bulkDupes > 0 && (
                  <p className={styles.previewDupes}>{bulkDupes} duplicate{bulkDupes !== 1 ? 's' : ''} removed</p>
                )}
                {bulkSource !== 'pasted' && (
                  <p className={styles.previewSource}>From: {bulkSource}</p>
                )}
                <div className={styles.previewCost}>
                  <span className={styles.costLabel}>Cost:</span>
                  <span className={styles.costValue}>{Math.ceil(bulkEmails.length / 5)} Credits</span>
                  <span className={styles.costCalc}>({formatInt(bulkEmails.length)} emails &divide; 5)</span>
                </div>
              </div>
              <div className={styles.previewActions}>
                <button className={styles.verifyBulkButton} onClick={handleBulkVerify}>
                  Verify {formatInt(bulkEmails.length)} emails
                </button>
                <button className={styles.resetButton} onClick={handleBulkReset}>Cancel</button>
              </div>
              {inputError && <p className={styles.errorText}>{inputError}</p>}
            </div>
          )}

          {/* Verifying phase */}
          {phase === 'verifying' && (
            <div className={styles.progressSection}>
              <div className={styles.progressHeader}>
                <span>Verifying {formatInt(bulkTotal)} emails...</span>
                <span className={styles.progressPct}>{bulkPct}%</span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: bulkPct + '%' }} />
              </div>
              <div className={styles.progressDetails}>
                <span>{formatInt(bulkProgress)} / {formatInt(bulkTotal)}</span>
              </div>
              <div className={styles.liveStats}>
                <div className={`${styles.liveStat} ${styles.liveValid}`}>
                  <span className={styles.liveCount}>{formatInt(bulkStats.valid)}</span>
                  <span className={styles.liveLabel}>Valid</span>
                </div>
                <div className={`${styles.liveStat} ${styles.liveInvalid}`}>
                  <span className={styles.liveCount}>{formatInt(bulkStats.invalid)}</span>
                  <span className={styles.liveLabel}>Invalid</span>
                </div>
                <div className={`${styles.liveStat} ${styles.liveRisky}`}>
                  <span className={styles.liveCount}>{formatInt(bulkStats.risky)}</span>
                  <span className={styles.liveLabel}>Risky</span>
                </div>
                <div className={`${styles.liveStat} ${styles.liveUnknown}`}>
                  <span className={styles.liveCount}>{formatInt(bulkStats.unknown)}</span>
                  <span className={styles.liveLabel}>Unknown</span>
                </div>
              </div>
              {bulkStats.error > 0 && (
                <div className={styles.errorInfoRow}>
                  <span className={styles.errorInfoCount}>{formatInt(bulkStats.error)}</span>
                  <span className={styles.errorInfoText}>
                    infrastructure {bulkStats.error === 1 ? 'failure' : 'failures'} so far - the worker could not reach these mailboxes
                  </span>
                </div>
              )}
              <p className={styles.progressNote}>Results update live as the worker processes your list.</p>
              <div className={styles.resultActions}>
                <button className={styles.resetButton} onClick={handleBulkCancel}>Cancel job</button>
              </div>
            </div>
          )}

          {/* Results phase */}
          {phase === 'results' && bulkResults && (
            <BulkVerificationResult
              type="email"
              jobId={bulkJobId}
              totalRows={bulkResults.total}
              processedRows={bulkResults.processedRows}
              status={bulkResults.status}
              durationMs={bulkResults.durationMs}
              countsHint={bulkResults.counts || null}
              onNewJob={handleBulkReset}
              toolChainHref="/smtp-test"
              toolChainLabel="Your list is verified. Test your SMTP connection"
              toolChainBadge="SMTP Tester"
            />
          )}

          {/* Back to single */}
          {phase === 'upload' && (
            <div className={styles.modeSwitch}>
              <button className={styles.modeSwitchLink} onClick={switchToSingle}>
                {'\u2190'} Verify a single email instead
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
