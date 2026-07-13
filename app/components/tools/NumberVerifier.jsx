import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router';
import styles from '~/styles/modules/tools/NumberVerifier.module.css';
import BulkVerificationResult from './BulkVerificationResult';
import { formatInt } from '~/utils/format';

/* NumberVerifier */

const BULK_AVAILABLE = true;

const DRAFT_KEY = 'trov_verify_number_draft_v1';
const RATE_LIMIT_HARD_FALLBACK_SECONDS = 60;

/* Bulk-mode constants */
const MAX_BULK_PHONES   = 10_000;
const POLL_INTERVAL_MS  = 1500;
const TERMINAL_STATES   = new Set(['complete', 'partial', 'cancelled', 'failed']);
const RESULT_PREVIEW_LIMIT = 50;

/* -- Icons -- */

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
      <line x1="9" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="6" y="2" width="12" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="18" r="0.75" fill="currentColor" />
    </svg>
  );
}

function LandlineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.43a16 16 0 0 0 6.48 6.48l1.25-1.25a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function VoipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M17 8a5 5 0 0 0-10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 8a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="16" width="3" height="6" rx="1" fill="currentColor" />
      <rect x="7.5" y="11" width="3" height="11" rx="1" fill="currentColor" />
      <rect x="13" y="6" width="3" height="16" rx="1" fill="currentColor" />
      <rect x="18.5" y="2" width="3" height="20" rx="1" fill="currentColor" />
    </svg>
  );
}

/* -- Country flag (cross-platform via flagcdn, no emoji) -- */

function CountryFlag({ code, size = 20, className }) {
  const src = `https://flagcdn.com/w40/${(code || 'us').toLowerCase()}.png`;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={Math.round(size * 0.75)}
      className={className}
      loading="lazy"
      style={{ objectFit: 'cover', borderRadius: 2 }}
    />
  );
}

/* -- Country list. Keep the same set the design system mocked.
      Order is roughly by traffic priority for the launch markets. -- */

const COUNTRIES = [
  { code: 'US', dial: '+1',   name: 'United States' },
  { code: 'GB', dial: '+44',  name: 'United Kingdom' },
  { code: 'NG', dial: '+234', name: 'Nigeria' },
  { code: 'IN', dial: '+91',  name: 'India' },
  { code: 'CA', dial: '+1',   name: 'Canada' },
  { code: 'AU', dial: '+61',  name: 'Australia' },
  { code: 'DE', dial: '+49',  name: 'Germany' },
  { code: 'FR', dial: '+33',  name: 'France' },
  { code: 'BR', dial: '+55',  name: 'Brazil' },
  { code: 'ZA', dial: '+27',  name: 'South Africa' },
  { code: 'KE', dial: '+254', name: 'Kenya' },
  { code: 'GH', dial: '+233', name: 'Ghana' },
  { code: 'AE', dial: '+971', name: 'UAE' },
  { code: 'SG', dial: '+65',  name: 'Singapore' },
  { code: 'JP', dial: '+81',  name: 'Japan' },
];

/* -- Display helpers --
      Server returns Twilio's lineType vocabulary (mobile / landline /
      fixedVoip / nonFixedVoip / personal / tollFree / pager / etc).
      We bucket into three visual buckets for the icon and color. */

function getLineTypeBucket(typeRaw) {
  const t = String(typeRaw || '').toLowerCase();
  if (t === 'mobile' || t === 'personal') return 'mobile';
  if (t === 'landline') return 'landline';
  if (t === 'fixedvoip' || t === 'nonfixedvoip' || t === 'voip') return 'voip';
  return 'unknown';
}

function getLineTypeIcon(typeRaw) {
  const b = getLineTypeBucket(typeRaw);
  if (b === 'mobile')   return <MobileIcon />;
  if (b === 'landline') return <LandlineIcon />;
  if (b === 'voip')     return <VoipIcon />;
  return <LandlineIcon />;
}

function getLineTypeClass(typeRaw) {
  const b = getLineTypeBucket(typeRaw);
  if (b === 'mobile')   return styles.typeMobile;
  if (b === 'landline') return styles.typeLandline;
  if (b === 'voip')     return styles.typeVoip;
  return styles.typeUnknown;
}

/* -- SMS deliverability verdict --
      Four states give the user the truth instead of a flat yes/no:

        confident  Mobile or personal line. Twilio confirmed. Send away.
        flaky      VoIP. Some carriers route SMS, many do not. The same
                   carrier varies by region. We say "yes, but test."
        uncertain  Twilio responded with partial data (lineType=unknown,
                   carrier=null). Could be SMS-capable, could not. Test.
        none       Landline, toll-free, premium, pager, etc. SMS will
                   fail silently on most carriers. Don't send.

      The CSS variant maps to: smsConfident (green) | smsFlaky (orange) |
      smsUncertain (orange) | smsNone (red). */

function getSmsVerdict(t) {
  if (!t) {
    return {
      kind: 'none',
      cssVariant: 'smsNone',
      icon: '\u2717',
      title: 'Delivery not possible',
      detail: 'No carrier data returned.',
    };
  }
  if (t.partial) {
    return {
      kind: 'uncertain',
      cssVariant: 'smsUncertain',
      icon: '?',
      title: 'Delivery uncertain',
      detail: 'Carrier could not be classified. Test with a single SMS before sending in volume.',
    };
  }
  const bucket = getLineTypeBucket(t.lineType);
  if (bucket === 'mobile') {
    return {
      kind: 'confident',
      cssVariant: 'smsConfident',
      icon: '\u2713',
      title: 'Can receive SMS and calls',
      detail: 'This number is reachable for text messages and voice calls.',
    };
  }
  if (bucket === 'voip') {
    return {
      kind: 'flaky',
      cssVariant: 'smsFlaky',
      icon: '!',
      title: 'SMS works but is unreliable',
      detail: 'VoIP carriers route SMS inconsistently. Some messages will deliver, others will fail silently. Test before sending in volume.',
    };
  }
  return {
    kind: 'none',
    cssVariant: 'smsNone',
    icon: '\u2717',
    title: 'Cannot receive SMS',
    detail: `This is a ${(t.lineTypeLabel || 'landline').toLowerCase()}. SMS delivery will fail silently.`,
  };
}

/* -- Map server error codes to plain user sentences --
      Mirrors the friendlyError pattern from EmailScorer. */

function friendlyError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Sign in for carrier lookup.';
    case 'INSUFFICIENT_CREDITS':
      return 'Not enough credits. Top up to continue.';
    case 'RATE_LIMITED':
      if (err?.retryAfterSeconds) {
        const mins = Math.ceil(err.retryAfterSeconds / 60);
        return `Rate limit reached. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
      }
      return 'Rate limit reached. Try again shortly.';
    case 'INPUT_TOO_LONG':
      return 'Phone number is too long.';
    case 'BAD_REQUEST':
      return 'Could not parse the request. Try again.';
    case 'TWILIO_NO_CREDENTIALS':
    case 'TWILIO_AUTH_FAILED':
      return 'Carrier lookup is not configured. Contact support.';
    case 'TWILIO_RATE_LIMITED':
      return 'Carrier lookup is busy. Your credit was refunded. Try again.';
    case 'TWILIO_TIMEOUT':
      return 'Carrier lookup timed out. Your credit was refunded.';
    case 'TWILIO_NOT_FOUND':
      return 'Carrier data is not available for this number. Your credit was refunded.';
    case 'TWILIO_TLS_FAILED':
      return 'TLS validation failed. Your credit was refunded.';
    case 'TWILIO_BAD_SHAPE':
    case 'TWILIO_API_ERROR':
      return 'Carrier lookup returned an unexpected response. Your credit was refunded.';
    default:
      return err?.message || 'Verification failed. Try again in a moment.';
  }
}

/* Component */

export default function NumberVerifier({
  isAuthed = false,
  initialBalance = null,
  creditCost = 2,
  welcomeBonus = 10,
} = {}) {
  const toolRef = useRef(null);

  /* Single-mode state */
  const [phase, setPhase] = useState('input');
  // 'input' | 'verifying' | 'tier1' | 'tier2loading' | 'tier2'
  const [country, setCountry] = useState('US');
  const [number, setNumber] = useState('');
  const [tier1Result, setTier1Result] = useState(null);
  const [tier2Result, setTier2Result] = useState(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [inputError, setInputError] = useState('');

  /* Auth + credits */
  const [balance, setBalance] = useState(initialBalance);
  const [needsAuth, setNeedsAuth] = useState(false);

  /* Bulk-mode state */
  const [mode, setMode]               = useState('single');     // 'single' | 'bulk'
  const [bulkPhase, setBulkPhase]     = useState('upload');     // 'upload' | 'preview' | 'verifying' | 'result'
  const [bulkPhones, setBulkPhones]   = useState([]);
  const [bulkDupes, setBulkDupes]     = useState(0);
  const [pasteText, setPasteText]     = useState('');
  const [bulkJobId, setBulkJobId]     = useState(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStats, setBulkStats]     = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkError, setBulkError]     = useState('');
  const [bulkStartedAt, setBulkStartedAt] = useState(null);
  const eventSourceRef = useRef(null);
  const pollTimerRef   = useRef(null);

  /*  sessionStorage draft persistence 
        Survives the signup round trip so the user does not retype on
        return. Cleared once a successful Tier 2 result comes back. */

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (typeof draft?.number === 'string' && draft.number) setNumber(draft.number);
      if (typeof draft?.country === 'string' && /^[A-Z]{2}$/.test(draft.country)) {
        setCountry(draft.country);
      }
    } catch { /* ignore malformed */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        if (number) {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ number, country }));
        }
      } catch { /* quota / private mode */ }
    }, 400);
    return () => clearTimeout(handle);
  }, [number, country]);

  useEffect(() => {
    if (phase === 'tier2' && tier2Result) {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    }
  }, [phase, tier2Result]);

  /* Helpers */

  const scrollToTool = useCallback(() => {
    if (toolRef.current) {
      const top = toolRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  const makeError = (data, status) => {
    const err = new Error(data?.error || `HTTP ${status}`);
    err.code = data?.code || `HTTP_${status}`;
    err.status = status;
    err.balance = data?.balance;
    err.retryAfterSeconds = data?.retryAfterSeconds || RATE_LIMIT_HARD_FALLBACK_SECONDS;
    return err;
  };

  /* Tier 1: format check */

  const handleVerify = useCallback(() => {
    const trimmed = number.trim();
    if (!trimmed) {
      setInputError('Enter a phone number');
      return;
    }
    setInputError('');
    setNeedsAuth(false);
    setPhase('verifying');
    setTier1Result(null);
    setTier2Result(null);

    fetch('/api/tools/verify-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mode: 'format', number: trimmed, country }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));
        return { res, data };
      })
      .then(({ res, data }) => {
        // Hard transport errors (rate limit, server error) come back with
        // ok=false AND a non-200 status. Format-validation failures use 200
        // with ok=false - those are tool results, not transport errors.
        if (!res.ok) {
          throw makeError(data, res.status);
        }
        if (data.ok) {
          setTier1Result({ valid: true, ...data.formatResult });
        } else {
          setTier1Result({
            valid: false,
            reason: data.error,
            partial: data.partial || null,
          });
        }
        setPhase('tier1');
      })
      .catch((err) => {
        setPhase('input');
        setInputError(friendlyError(err));
      });
  }, [number, country]);

  /*  Tier 2: carrier lookup 
        Anonymous users see the inline signup CTA instead of an error.
        sessionStorage draft survives the round trip. */

  const handleCarrierLookup = useCallback(() => {
    if (!isAuthed) {
      setNeedsAuth(true);
      // Scroll the prompt into view so it isn't missed below the fold.
      requestAnimationFrame(() => scrollToTool());
      return;
    }
    if (!tier1Result?.valid) {
      // Defensive: this button only renders when tier1Result.valid is true.
      return;
    }

    setNeedsAuth(false);
    setInputError('');
    setPhase('tier2loading');

    fetch('/api/tools/verify-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mode: 'carrier', number: number.trim(), country }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));
        if (!res.ok || !data.ok) {
          throw makeError(data, res.status);
        }
        return data;
      })
      .then((data) => {
        setTier2Result(data.carrierResult);
        if (data.credits && typeof data.credits.balance === 'number') {
          setBalance(data.credits.balance);
        }
        setPhase('tier2');
      })
      .catch((err) => {
        // Auth - the user lost their session mid-flow. Show the signup prompt.
        if (err.code === 'AUTH_REQUIRED') {
          setNeedsAuth(true);
          setPhase('tier1');
          return;
        }
        // Insufficient credits - keep Tier 1 visible, surface the error.
        if (err.code === 'INSUFFICIENT_CREDITS') {
          if (typeof err.balance === 'number') setBalance(err.balance);
          setInputError(friendlyError(err));
          setPhase('tier1');
          return;
        }
        // Anything else: refund happened server-side, return to Tier 1 with
        // a clear error.
        setInputError(friendlyError(err));
        setPhase('tier1');
      });
  }, [isAuthed, tier1Result, number, country, scrollToTool]);

  /* Reset / retry */

  const handleSingleReset = useCallback(() => {
    setNumber('');
    setTier1Result(null);
    setTier2Result(null);
    setInputError('');
    setNeedsAuth(false);
    setPhase('input');
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  const handleSingleRetry = useCallback(() => {
    setTier1Result(null);
    setTier2Result(null);
    setInputError('');
    setNeedsAuth(false);
    setPhase('input');
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && phase === 'input') handleVerify();
  }, [phase, handleVerify]);

  /* Derived */

  const selectedCountry = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];

  // Badge text mirrors EmailScorer's pattern - one freeBadge that adapts
  // to the auth and balance state so we never need a second pill.
  const badgeText = mode === 'bulk'
    ? `${creditCost} CR / NUMBER`
    : !isAuthed
      ? `${welcomeBonus} free with signup`
      : balance !== null
        ? `${creditCost} CR / lookup · ${balance} left`
        : `${creditCost} CR / lookup`;

  /*  Bulk handlers 
     Mirror EmailVerifier's bulk pattern. Phone bulk is paste-only - no
     CSV upload because phone lists are small enough to paste and pasting
     plus a textarea sidesteps the parser-and-drop-zone surface area. */

  const cleanupBulkChannels = useCallback(() => {
    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch {}
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => cleanupBulkChannels(), [cleanupBulkChannels]);

  const switchToBulk = useCallback(() => {
    if (!isAuthed) { setNeedsAuth(true); return; }
    setMode('bulk');
    setBulkPhase('upload');
    setBulkError('');
  }, [isAuthed]);

  const switchToSingle = useCallback(() => {
    cleanupBulkChannels();
    setMode('single');
    setBulkPhase('upload');
    setBulkPhones([]);
    setBulkDupes(0);
    setPasteText('');
    setBulkJobId(null);
    setBulkProgress(0);
    setBulkStats(null);
    setBulkResults(null);
    setBulkError('');
    setBulkStartedAt(null);
  }, [cleanupBulkChannels]);

  const handlePasteSubmit = useCallback(() => {
    setBulkError('');
    const lines = pasteText
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkError('Paste at least one phone number');
      return;
    }
    if (lines.length > MAX_BULK_PHONES) {
      setBulkError(`Too many numbers. Max ${formatInt(MAX_BULK_PHONES)} per job`);
      return;
    }

    // Dedupe (case-insensitive on the trimmed string).
    const seen = new Set();
    const unique = [];
    for (const line of lines) {
      const k = line.toLowerCase();
      if (!seen.has(k)) { seen.add(k); unique.push(line); }
    }

    setBulkPhones(unique);
    setBulkDupes(lines.length - unique.length);
    setBulkPhase('preview');
  }, [pasteText]);

  const finalizeBulkJob = useCallback(async (jobId, startedAt) => {
    cleanupBulkChannels();

    let final = null;
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      if (res.ok) {
        const body = await res.json();
        if (body.ok && body.progress) final = body.progress;
      }
    } catch { /* fall through */ }

    setBulkResults({
      jobId,
      totalRows:      bulkPhones.length,
      processedRows:  final?.processedRows ?? bulkProgress,
      counts:         final?.counts ?? bulkStats?.counts ?? null,
      status:         final?.status ?? 'complete',
      durationMs:     startedAt ? (Date.now() - startedAt) : null,
    });
    setBulkPhase('result');
  }, [bulkPhones.length, bulkProgress, bulkStats, cleanupBulkChannels]);

  const startPolling = useCallback((jobId, startedAt) => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`);
        if (!res.ok) return;
        const body = await res.json();
        if (!body.ok || !body.progress) return;
        const p = body.progress;
        setBulkProgress(p.processedRows || 0);
        setBulkStats(p);
        if (TERMINAL_STATES.has(p.status)) {
          finalizeBulkJob(jobId, startedAt);
        }
      } catch { /* tolerate transient errors */ }
    }, POLL_INTERVAL_MS);
  }, [finalizeBulkJob]);

  const startTracking = useCallback((jobId, startedAt) => {
    if (typeof window === 'undefined' || !('EventSource' in window)) {
      startPolling(jobId, startedAt);
      return;
    }

    try {
      const es = new EventSource(`/api/jobs/${jobId}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (typeof data?.processedRows === 'number') setBulkProgress(data.processedRows);
          setBulkStats(data);
          if (TERMINAL_STATES.has(data.status)) {
            finalizeBulkJob(jobId, startedAt);
          }
        } catch { /* tolerate malformed frames */ }
      };
      es.addEventListener('complete', () => finalizeBulkJob(jobId, startedAt));
      es.addEventListener('timeout',  () => finalizeBulkJob(jobId, startedAt));
      es.addEventListener('gone',     () => finalizeBulkJob(jobId, startedAt));
      es.onerror = () => {
        // SSE failed; fall back to polling without abandoning progress so far.
        try { es.close(); } catch {}
        eventSourceRef.current = null;
        if (!pollTimerRef.current) startPolling(jobId, startedAt);
      };
    } catch {
      startPolling(jobId, startedAt);
    }
  }, [finalizeBulkJob, startPolling]);

  const handleBulkVerify = useCallback(async () => {
    if (bulkPhones.length === 0) return;
    setBulkError('');
    setBulkPhase('verifying');
    setBulkProgress(0);
    setBulkStats(null);

    const startedAt = Date.now();
    setBulkStartedAt(startedAt);

    try {
      const res = await fetch('/api/tools/verify-number-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ numbers: bulkPhones, country }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        setBulkError(body.error || `Could not start job (${res.status})`);
        setBulkPhase('preview');
        return;
      }

      setBulkJobId(body.jobId);
      // Optimistic balance update so user sees the spend immediately.
      if (typeof body.creditsHeld === 'number' && balance !== null) {
        setBalance(Math.max(0, balance - body.creditsHeld));
      }
      startTracking(body.jobId, startedAt);
    } catch (err) {
      setBulkError('Network error - try again');
      setBulkPhase('preview');
    }
  }, [bulkPhones, country, balance, startTracking]);

  const handleBulkCancel = useCallback(async () => {
    if (!bulkJobId) return;
    try {
      const res = await fetch(`/api/jobs/${bulkJobId}/cancel`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      cleanupBulkChannels();
      if (res.ok && body.ok) {
        if (typeof body.creditsRefunded === 'number' && balance !== null) {
          setBalance(balance + body.creditsRefunded);
        }
        setBulkResults({
          jobId:         bulkJobId,
          totalRows:     body.totalRows,
          processedRows: body.processedRows,
          counts:        bulkStats?.counts ?? null,
          status:        'cancelled',
          creditsRefunded: body.creditsRefunded,
          durationMs:    bulkStartedAt ? (Date.now() - bulkStartedAt) : null,
        });
        setBulkPhase('result');
      } else {
        setBulkError(body.error || 'Could not cancel');
      }
    } catch {
      setBulkError('Could not cancel - check progress to confirm');
    }
  }, [bulkJobId, balance, bulkStats, bulkStartedAt, cleanupBulkChannels]);

  const handleBulkReset = useCallback(() => {
    cleanupBulkChannels();
    setBulkPhase('upload');
    setBulkPhones([]);
    setBulkDupes(0);
    setPasteText('');
    setBulkJobId(null);
    setBulkProgress(0);
    setBulkStats(null);
    setBulkResults(null);
    setBulkError('');
    setBulkStartedAt(null);
  }, [cleanupBulkChannels]);


  return (
    <div ref={toolRef} className={styles.tool}>
      {/* Header */}
      <div className={styles.toolHeader}>
        <div className={styles.toolHeaderLeft}>
          <span className={styles.toolIcon}><PhoneIcon /></span>
          <div>
            <h2 className={styles.toolTitle}>Number Verifier</h2>
            <p className={styles.toolSubtitle}>
              Validate phone numbers and detect carrier info
            </p>
          </div>
        </div>
        <span className={styles.freeBadge}>{badgeText}</span>
      </div>

      {/* Single mode (the only mode that ships) */}
      {mode === 'single' && (
      <>

      {/* Input */}
      {(phase === 'input' || phase === 'verifying') && (
        <div className={styles.singleInput}>
          <div className={styles.inputRow}>
            <button
              className={styles.countryButton}
              onClick={() => setShowCountryPicker(!showCountryPicker)}
              disabled={phase === 'verifying'}
              type="button"
            >
              <CountryFlag code={selectedCountry.code} size={20} className={styles.countryFlag} />
              <span className={styles.countryDial}>{selectedCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className={styles.countryChevron}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              type="tel"
              className={styles.numberInput}
              placeholder="(415) 555-0123"
              value={number}
              autoComplete="off"
              onChange={(e) => { setNumber(e.target.value); setInputError(''); }}
              onKeyDown={handleKeyDown}
              disabled={phase === 'verifying'}
              maxLength={32}
            />
            <button
              className={styles.verifyButton}
              onClick={handleVerify}
              disabled={phase === 'verifying' || !number.trim()}
            >
              {phase === 'verifying' ? (
                <span className={styles.verifyingState}>
                  <span className={styles.spinnerDot} />Checking
                </span>
              ) : 'Verify'}
            </button>
          </div>

          {showCountryPicker && (
            <div className={styles.countryDropdown}>
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  className={`${styles.countryOption} ${c.code === country ? styles.countryOptionActive : ''}`}
                  onClick={() => { setCountry(c.code); setShowCountryPicker(false); }}
                >
                  <CountryFlag code={c.code} size={18} className={styles.optionFlag} />
                  <span className={styles.optionName}>{c.name}</span>
                  <span className={styles.optionDial}>{c.dial}</span>
                </button>
              ))}
            </div>
          )}

          {inputError && <p className={styles.errorText}>{inputError}</p>}
        </div>
      )}

      {/* Tier 1 result */}
      {tier1Result && (phase === 'tier1' || phase === 'tier2loading' || phase === 'tier2') && (
        <div className={styles.resultSection}>
          {tier1Result.valid ? (
            <div className={styles.numberHero}>
              <div className={styles.numberHeroTop}>
                <CountryFlag
                  code={tier1Result.country || selectedCountry.code}
                  size={32}
                  className={styles.heroFlag}
                />
                <span className={styles.heroNumber}>
                  {tier1Result.international || tier1Result.e164}
                </span>
              </div>
              <div className={styles.heroMeta}>
                <span className={styles.heroCountry}>
                  {tier1Result.countryName || tier1Result.country || 'Unknown'}
                </span>
                {tier1Result.callingCode && (
                  <>
                    <span className={styles.heroDot}>{'\u00B7'}</span>
                    <span className={styles.heroRegion}>{tier1Result.callingCode}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.numberHeroInvalid}>
              <span className={styles.invalidX}>{'\u2717'}</span>
              <div>
                <p className={styles.invalidTitle}>Invalid number</p>
                <p className={styles.invalidReason}>{tier1Result.reason}</p>
                {tier1Result.partial?.e164 && (
                  <p className={styles.invalidPartial}>
                    Closest parse: <code>{tier1Result.partial.e164}</code>
                    {tier1Result.partial.countryName ? ` (${tier1Result.partial.countryName})` : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {tier1Result.valid && (
            <div className={styles.infoCards}>
              <div className={`${styles.typeCard} ${getLineTypeClass(tier1Result.typeRaw)}`}>
                <div className={styles.typeIconWrap}>{getLineTypeIcon(tier1Result.typeRaw)}</div>
                <div>
                  <span className={styles.typeLabel}>{tier1Result.typeEstimate}</span>
                  <span className={styles.typeNote}>estimated from number range</span>
                </div>
              </div>
              <div className={styles.formatCard}>
                <div className={styles.formatRow}>
                  <span className={styles.formatLabel}>E.164</span>
                  <span className={styles.formatValue}>{tier1Result.e164}</span>
                </div>
                <div className={styles.formatRow}>
                  <span className={styles.formatLabel}>National</span>
                  <span className={styles.formatValue}>{tier1Result.national}</span>
                </div>
              </div>
            </div>
          )}

          {/* Lookup error banner - surfaces server-side errors that
              landed on the result section (insufficient credits, rate
              limits, refunded API failures). Without this, errors set
              during a Tier 2 attempt have nowhere to render because
              the input-block error text only mounts when phase is
              'input' or 'verifying'. */}
          {tier1Result.valid && phase === 'tier1' && inputError && !needsAuth && (
            <div className={styles.lookupError} role="alert">
              <span className={styles.lookupErrorIcon} aria-hidden="true">!</span>
              <div className={styles.lookupErrorContent}>
                <span className={styles.lookupErrorMessage}>{inputError}</span>
                {balance === 0 && isAuthed && (
                  <Link to="/credits" className={styles.lookupErrorAction}>
                    Buy credits
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Tier 2 unlock CTA - shown only on a valid Tier 1 result, before
              the lookup runs and only when the user is NOT already showing
              the signup prompt. */}
          {tier1Result.valid && phase === 'tier1' && !needsAuth && (
            <div className={styles.tier2Unlock}>
              <div className={styles.tier2Header}>
                <SignalIcon />
                <span>Carrier lookup</span>
              </div>
              <p className={styles.tier2Desc}>
                Get confirmed carrier name, verified line type, and SMS capability.
              </p>
              <button
                className={styles.tier2Button}
                onClick={handleCarrierLookup}
                disabled={isAuthed && balance === 0}
              >
                {isAuthed && balance === 0 ? 'Out of credits' : 'Get Carrier Info'}
                <span className={styles.tier2Cost}>{creditCost} Credits</span>
              </button>
              {!isAuthed && (
                <p className={styles.tier2Free}>
                  {welcomeBonus} free credits when you sign up
                </p>
              )}
            </div>
          )}

          {/* Inline signup CTA. Replaces the unlock card when the user
              clicked 'Get Carrier Info' anonymously, OR when their session
              expired mid-flow. */}
          {needsAuth && (
            <div className={styles.authPrompt}>
              <div className={styles.authPromptHead}>
                <span className={styles.authPromptTitle}>Sign up for carrier lookup</span>
                <span className={styles.authPromptBonus}>{welcomeBonus} free credits</span>
              </div>
              <p className={styles.authPromptBody}>
                Carrier lookup contacts the live phone network, which costs real money to run. New
                accounts get {welcomeBonus} free credits - enough for {Math.floor(welcomeBonus / creditCost)} carrier lookups. No card required. Your number is saved while you sign up.
              </p>
              <div className={styles.authPromptActions}>
                <Link
                  to={`/signup?redirectTo=${encodeURIComponent('/verify-number')}`}
                  className={styles.authPromptPrimary}
                >
                  Create free account
                </Link>
                <Link
                  to={`/login?redirectTo=${encodeURIComponent('/verify-number')}`}
                  className={styles.authPromptSecondary}
                >
                  I have an account
                </Link>
              </div>
            </div>
          )}

          {/* Tier 2 loading */}
          {phase === 'tier2loading' && (
            <div className={styles.tier2LoadingBar}>
              <div className={styles.tier2LoadingLabel}>
                <span className={styles.spinnerDot} />Looking up carrier...
              </div>
              <div className={styles.loadingTrack}>
                <div className={styles.loadingFill} />
              </div>
            </div>
          )}

          {/* Tier 2 result */}
          {tier2Result && phase === 'tier2' && (
            <div className={styles.carrierResult}>
              <div className={styles.carrierIdentity}>
                <div className={styles.carrierNameRow}>
                  <span className={styles.carrierName}>
                    {tier2Result.carrier || (tier2Result.partial ? 'Carrier unknown' : 'Carrier not reported')}
                  </span>
                  <span className={`${styles.confirmedBadge} ${getLineTypeClass(tier2Result.lineType)}`}>
                    {getLineTypeIcon(tier2Result.lineType)}
                    {tier2Result.lineTypeLabel}
                  </span>
                </div>
                {tier2Result.cnam && (
                  <span className={styles.carrierCnam}>Registered to {tier2Result.cnam}</span>
                )}
              </div>

              <div className={styles.carrierDetails}>
                <div className={styles.carrierDetail}>
                  <span className={styles.carrierDetailLabel}>Line type</span>
                  <span className={styles.carrierDetailValue}>
                    {tier2Result.lineTypeLabel}
                    {tier2Result.confirmed ? ' (confirmed)' : ' (estimated)'}
                  </span>
                </div>
                <div className={styles.carrierDetail}>
                  <span className={styles.carrierDetailLabel}>SMS capable</span>
                  <span className={styles.carrierDetailValue}>
                    {(() => {
                      const v = getSmsVerdict(tier2Result);
                      return v.kind === 'confident' ? 'Yes'
                        : v.kind === 'flaky' ? 'Yes (limited)'
                        : v.kind === 'uncertain' ? 'Unclear'
                        : 'No';
                    })()}
                  </span>
                </div>
              </div>

              {(() => {
                const v = getSmsVerdict(tier2Result);
                return (
                  <div className={`${styles.smsVerdict} ${styles[v.cssVariant]}`}>
                    <span className={styles.smsIcon}>{v.icon}</span>
                    <div>
                      <span className={styles.smsTitle}>{v.title}</span>
                      <span className={styles.smsDetail}>{v.detail}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {(phase === 'tier1' || phase === 'tier2') && (
            <div className={styles.resultActions}>
              <button className={styles.retryButton} onClick={handleSingleRetry}>
                Verify another
              </button>
              <button className={styles.resetButton} onClick={handleSingleReset}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      </>
      )}

      {/* BULK MODE */}
      {mode === 'bulk' && (
      <>
        {/* Upload (paste) */}
        {bulkPhase === 'upload' && (
          <div className={styles.bulkUpload}>
            <div className={styles.bulkCountryRow}>
              <label className={styles.bulkCountryLabel}>Default country for numbers without &lsquo;+&rsquo;</label>
              <div className={styles.bulkCountryAnchor}>
                <button
                  className={styles.countryButton}
                  onClick={() => setShowCountryPicker(!showCountryPicker)}
                  type="button"
                >
                  <CountryFlag code={selectedCountry.code} size={20} className={styles.countryFlag} />
                  <span className={styles.countryDial}>{selectedCountry.dial}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className={styles.countryChevron}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showCountryPicker && (
                  <div className={styles.countryDropdown}>
                    {COUNTRIES.map((c) => (
                      <button
                        key={c.code}
                        className={`${styles.countryOption} ${c.code === country ? styles.countryOptionActive : ''}`}
                        onClick={() => { setCountry(c.code); setShowCountryPicker(false); }}
                        type="button"
                      >
                        <CountryFlag code={c.code} size={20} className={styles.countryFlag} />
                        <span className={styles.countryName}>{c.name}</span>
                        <span className={styles.countryDialOpt}>{c.dial}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.bulkPasteSection}>
              <p className={styles.bulkPasteLabel}>Paste numbers, one per line:</p>
              <textarea
                className={styles.bulkPasteArea}
                rows={8}
                placeholder={'+15551234567\n+447911123456\n5552345678'}
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setBulkError(''); }}
              />
              <button
                className={styles.bulkPasteSubmit}
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim()}
              >
                Load numbers
              </button>
            </div>

            <p className={styles.bulkUploadHint}>
              Max {formatInt(MAX_BULK_PHONES)} numbers per job &middot; E.164 (+15...) or national format with country
            </p>
            {bulkError && <p className={styles.bulkErrorText}>{bulkError}</p>}

            <div className={styles.modeSwitch}>
              <button className={styles.modeSwitchLink} onClick={switchToSingle} type="button">
                <span className={styles.arrow}>{'\u2190'}</span> Back to single verification
              </button>
            </div>
          </div>
        )}

        {/* Preview */}
        {bulkPhase === 'preview' && (
          <div className={styles.bulkPreviewSection}>
            <div className={styles.bulkPreviewCard}>
              <div className={styles.bulkPreviewStats}>
                <span className={styles.bulkPreviewCount}>{formatInt(bulkPhones.length)}</span>
                <span className={styles.bulkPreviewLabel}>unique numbers</span>
              </div>
              {bulkDupes > 0 && (
                <p className={styles.bulkPreviewDupes}>{bulkDupes} duplicate{bulkDupes !== 1 ? 's' : ''} removed</p>
              )}
              <div className={styles.bulkPreviewCost}>
                <span className={styles.bulkCostLabel}>Cost:</span>
                <span className={styles.bulkCostValue}>{formatInt(bulkPhones.length * creditCost)} Credits</span>
                <span className={styles.bulkCostCalc}>({formatInt(bulkPhones.length)} &times; {creditCost})</span>
              </div>
              <div className={styles.bulkPreviewCountry}>
                Default country: <CountryFlag code={selectedCountry.code} size={14} /> <strong>{selectedCountry.name}</strong>
              </div>
            </div>

            <div className={styles.bulkPreviewActions}>
              <button className={styles.bulkVerifyButton} onClick={handleBulkVerify}>
                Verify {formatInt(bulkPhones.length)} numbers
              </button>
              <button className={styles.bulkBackButton} onClick={handleBulkReset}>
                Back
              </button>
            </div>

            {bulkError && <p className={styles.bulkErrorText}>{bulkError}</p>}
          </div>
        )}

        {/* Verifying (live progress) */}
        {bulkPhase === 'verifying' && (
          <div className={styles.bulkProgressSection}>
            <div className={styles.bulkProgressHeader}>
              <span className={styles.bulkProgressLabel}>
                <span className={styles.spinnerDot} />
                Verifying {formatInt(bulkPhones.length)} numbers
              </span>
              <span className={styles.bulkProgressCount}>
                {formatInt(bulkProgress)} / {formatInt(bulkPhones.length)}
              </span>
            </div>
            <div className={styles.bulkProgressTrack}>
              <div
                className={styles.bulkProgressFill}
                style={{ width: `${Math.min(100, (bulkProgress / Math.max(1, bulkPhones.length)) * 100)}%` }}
              />
            </div>
            {bulkStats?.counts && (
              <div className={styles.bulkLiveStats}>
                <span className={styles.bulkStatValid}>{bulkStats.counts.valid || 0} mobile</span>
                <span className={styles.bulkStatRisky}>{bulkStats.counts.risky || 0} landline/voip</span>
                <span className={styles.bulkStatInvalid}>{bulkStats.counts.invalid || 0} invalid</span>
                {(bulkStats.counts.error || 0) > 0 && (
                  <span className={styles.bulkStatError}>{bulkStats.counts.error} error</span>
                )}
              </div>
            )}
            <button className={styles.bulkCancelButton} onClick={handleBulkCancel}>
              Cancel job
            </button>
          </div>
        )}

        {/* Result */}
        {bulkPhase === 'result' && bulkResults && (
          <BulkVerificationResult
            type="phone"
            jobId={bulkResults.jobId}
            totalRows={bulkResults.totalRows}
            processedRows={bulkResults.processedRows}
            status={bulkResults.status}
            durationMs={bulkResults.durationMs}
            creditsRefunded={bulkResults.creditsRefunded}
            countsHint={bulkResults.counts || null}
            onNewJob={handleBulkReset}
            onBackToSingle={switchToSingle}
          />
        )}
      </>
      )}

      {/* Mode-switch link from single -> bulk */}
      {mode === 'single' && (phase === 'input' || phase === 'tier1' || phase === 'tier2') && (
        <div className={styles.modeSwitch}>
          <button className={styles.modeSwitchLink} onClick={switchToBulk} type="button">
            Have a list? Verify in bulk <span className={styles.arrow}>{'\u2192'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
