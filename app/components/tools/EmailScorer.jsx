import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import styles from '~/styles/modules/tools/EmailScorer.module.css';

/* -- Icons -- */

function GaugeIcon({ size = 20, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusIcon({ status, size = 16 }) {
  if (status === 'pass' || status === 'info') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={status === 'pass' ? styles.iconPass : styles.iconInfo}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        {status === 'pass'
          ? <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M12 8v.5M12 11v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        }
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={styles.iconWarning}>
        <path d="M12 3L2 20h20L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 10v4M12 16.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={styles.iconCritical}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightSmall({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -- Shape reference --
   The /api/tools/score-email endpoint returns:
     result: { score, verdict, summary, categories: [{id, label, score, max}], issues: [...] }
   Defined server-side in app/lib/arcis.server.js and enforced on every response. */

/* -- Processing step definitions -- */

const ANALYSIS_STEPS = [
  'Checking subject line',
  'Analyzing body content',
  'Evaluating structure',
  'Scanning links & CTAs',
  'Checking compliance',
];

/* -- Verdict config -- */

const VERDICT_CONFIG = {
  excellent: { label: 'Excellent', color: 'var(--trov-success)' },
  good: { label: 'Good', color: 'var(--trov-success)' },
  needs_work: { label: 'Needs Work', color: 'var(--trov-warning)' },
  poor: { label: 'Poor', color: 'var(--trov-error)' },
  critical: { label: 'Critical', color: 'var(--trov-error)' },
};

function getVerdict(score) {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'needs_work';
  if (score >= 30) return 'poor';
  return 'critical';
}

/* -- Translate API error codes into user-facing sentences. No apologetic
      voice, no exclamation marks, concrete next step where possible. -- */

function friendlyError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Sign in to score emails.';
    case 'INSUFFICIENT_CREDITS':
      return 'Not enough credits. Top up to continue scoring.';
    case 'RATE_LIMITED':
      if (err?.retryAfterSeconds) {
        const mins = Math.ceil(err.retryAfterSeconds / 60);
        return `Rate limit reached. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
      }
      return 'Rate limit reached. Try again shortly.';
    case 'VALIDATION':
    case 'ARCIS_VALIDATION':
      return err.message || 'Check your input and try again.';
    case 'ARCIS_RATE_LIMITED':
      return 'Scoring engine is busy. Retry in a moment.';
    case 'ARCIS_TIMEOUT':
      return 'Scoring engine timed out. Your credit was refunded. Try again.';
    case 'ARCIS_BAD_SHAPE':
    case 'ARCIS_API_ERROR':
      return 'Scoring engine returned an unexpected response. Your credit was refunded.';
    case 'ARCIS_NO_API_KEY':
      return 'Scoring engine is not configured. Contact support.';
    default:
      return err?.message || 'Scoring failed. Try again in a moment.';
  }
}

/* -- Component --
   Props:
     isAuthed         Boolean  Whether the user has an active session.
     initialBalance   Number   Current credit balance (null when anonymous).
     creditCost       Number   Credits charged per scan (default 1, from server).
     welcomeBonus     Number   Credits granted on signup (for CTA copy).
   All sourced from the /score route loader. */

export default function EmailScorer({
  isAuthed = false,
  initialBalance = null,
  creditCost = 1,
  welcomeBonus = 10,
} = {}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [inputMode, setInputMode] = useState('simple');
  const [phase, setPhase] = useState('input');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [results, setResults] = useState(null);
  const [previousScore, setPreviousScore] = useState(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [inputError, setInputError] = useState('');
  const [balance, setBalance] = useState(initialBalance);
  const [needsAuth, setNeedsAuth] = useState(!isAuthed);
  const stepIntervalRef = useRef(null);
  const scoreAnimRef = useRef(null);
  const resultsRef = useRef(null);
  const toolRef = useRef(null);

  /* Persist draft to sessionStorage so anonymous users don't lose their
     email when redirected through signup/login. sessionStorage clears on
     tab close, which is the right lifetime for a scoring session. */
  const DRAFT_KEY = 'trov_score_draft_v1';

  useEffect(() => {
    // Hydrate on mount. Only runs once.
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (typeof draft.subject === 'string' && !subject) setSubject(draft.subject);
      if (typeof draft.body === 'string' && !body) setBody(draft.body);
      if (draft.inputMode === 'html' || draft.inputMode === 'simple') setInputMode(draft.inputMode);
    } catch { /* ignore malformed draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Persist on change. Debounced via setTimeout to avoid writing on every keystroke.
    const handle = setTimeout(() => {
      try {
        if (subject || body) {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, body, inputMode }));
        }
      } catch { /* quota or disabled storage */ }
    }, 400);
    return () => clearTimeout(handle);
  }, [subject, body, inputMode]);

  /* Clear the draft after a successful score so it doesn't re-hydrate next visit. */
  useEffect(() => {
    if (phase === 'results' && results) {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    }
  }, [phase, results]);

  /* Validate input */
  const validate = useCallback(() => {
    if (!subject.trim()) return 'Enter a subject line';
    if (!body.trim()) {
      return inputMode === 'html' ? 'Paste your email HTML' : 'Enter email body content';
    }
    if (body.trim().length < 10) {
      return inputMode === 'html' ? 'Email content is too short to analyze' : 'Email body is too short to analyze';
    }
    return '';
  }, [subject, body, inputMode]);

  /* Start scoring: run the visual step animation AND the real fetch in
     parallel. Show results only when both resolve, so the animation is
     always visible and we never render stale or malformed data. */
  const handleScore = useCallback(() => {
    const error = validate();
    if (error) {
      setInputError(error);
      return;
    }
    setInputError('');

    if (results) {
      setPreviousScore(results.score);
    }

    setPhase('processing');
    setCompletedSteps([]);
    setAnimatedScore(0);
    setBarsAnimated(false);

    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);

    // Kick off the real API request immediately.
    const payload = {
      mode: inputMode,
      subject: subject.trim(),
      body: body.trim(),
    };

    const fetchPromise = fetch('/api/tools/score-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));
      if (!res.ok || !data.ok) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.code = data.code || `HTTP_${res.status}`;
        err.status = res.status;
        err.balance = data.balance;
        err.retryAfterSeconds = data.retryAfterSeconds;
        throw err;
      }
      return data;
    });

    // Step through the visual animation alongside the fetch.
    let stepIdx = 0;
    const animationPromise = new Promise((resolve) => {
      stepIntervalRef.current = setInterval(() => {
        if (stepIdx >= ANALYSIS_STEPS.length) {
          clearInterval(stepIntervalRef.current);
          stepIntervalRef.current = null;
          resolve();
          return;
        }
        setCompletedSteps((prev) => [...prev, stepIdx]);
        stepIdx++;
      }, 450);
    });

    Promise.all([fetchPromise, animationPromise])
      .then(([payload]) => {
        if (stepIntervalRef.current) {
          clearInterval(stepIntervalRef.current);
          stepIntervalRef.current = null;
        }
        setResults(payload.result);
        if (payload.credits && typeof payload.credits.balance === 'number') {
          setBalance(payload.credits.balance);
        }
        setPhase('results');
      })
      .catch((err) => {
        if (stepIntervalRef.current) {
          clearInterval(stepIntervalRef.current);
          stepIntervalRef.current = null;
        }
        setPhase('input');
        // Surface auth as a dedicated prompt, not a generic error string.
        // Anonymous users get a clear CTA to sign up instead of a dead end.
        if (err?.code === 'AUTH_REQUIRED') {
          setNeedsAuth(true);
          setInputError('');
        } else {
          setNeedsAuth(false);
          setInputError(friendlyError(err));
        }
        // Keep balance in sync if the server sent one back on failure.
        if (typeof err?.balance === 'number') {
          setBalance(err.balance);
        }
      });
  }, [validate, results, inputMode, subject, body]);

  /* Animate score counter */
  useEffect(() => {
    if (phase !== 'results' || !results) return;

    const target = results.score;
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start; 
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * target));

      if (progress < 1) {
        scoreAnimRef.current = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setBarsAnimated(true), 200);
      }
    }

    scoreAnimRef.current = requestAnimationFrame(tick);
    return () => {
      if (scoreAnimRef.current) cancelAnimationFrame(scoreAnimRef.current);
    };
  }, [phase, results]);

  /* Scroll to results */
  useEffect(() => {
    if (phase === 'results' && toolRef.current) {
      const headerOffset = 80;
      const top = toolRef.current.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, [phase]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      if (scoreAnimRef.current) cancelAnimationFrame(scoreAnimRef.current);
    };
  }, []);

  /* Scroll to tool card top, offset for sticky header */
  const scrollToTool = useCallback(() => {
    if (toolRef.current) {
      const headerOffset = 80;
      const top = toolRef.current.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  /* Reset to edit */
  const handleEdit = useCallback(() => {
    setPhase('input');
    setCompletedSteps([]);
    setBarsAnimated(false);
    setAnimatedScore(0);
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  /* Full reset */
  const handleReset = useCallback(() => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    setPhase('input');
    setSubject('');
    setBody('');
    setResults(null);
    setPreviousScore(null);
    setCompletedSteps([]);
    setBarsAnimated(false);
    setAnimatedScore(0);
    setInputError('');
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleScore();
  }, [handleScore]);

  const verdict = results ? VERDICT_CONFIG[results.verdict] || VERDICT_CONFIG.good : null;
  const scoreDiff = previousScore !== null && results ? results.score - previousScore : null;

  return (
    <div ref={toolRef} className={styles.tool}>
      {/* Tool Header */}
      <div className={styles.toolHeader}>
        <div className={styles.toolHeaderLeft}>
          <div className={styles.toolIcon}>
            <GaugeIcon size={22} />
          </div>
          <div>
            <h2 className={styles.toolTitle}>Email Scorer</h2>
            <p className={styles.toolDesc}>Score your email for deliverability before you send</p>
          </div>
        </div>
        <span className={styles.freeBadge}>
          {creditCost === 0
            ? 'Free'
            : !isAuthed
            ? `${welcomeBonus} free with signup`
            : balance !== null
            ? `${creditCost} Credit / scan · ${balance} left`
            : `${creditCost} Credit / scan`}
        </span>
      </div>

      {/* Input State */}
      {(phase === 'input' || phase === 'processing') && (
        <div className={styles.inputSection}>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${inputMode === 'simple' ? styles.modeBtnActive : ''}`}
              onClick={() => setInputMode('simple')}
              disabled={phase === 'processing'}
            >
              Simple
            </button>
            <button
              className={`${styles.modeBtn} ${inputMode === 'html' ? styles.modeBtnActive : ''}`}
              onClick={() => setInputMode('html')}
              disabled={phase === 'processing'}
            >
              HTML
            </button>
          </div>

          {/* Subject line - always shown. The email Subject header is
              metadata at the SMTP level; the HTML <title> tag is a
              separate thing some clients use for inbox preview. They
              are not interchangeable, so we collect Subject regardless
              of mode. */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Subject line</label>
            <input
              type="text"
              className={styles.subjectInput}
              placeholder="Your Weekly Newsletter - March 2026"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setInputError(''); }}
              disabled={phase === 'processing'}
              onKeyDown={handleKeyDown}
            />
            {subject.length > 60 && (
              <span className={styles.charWarn}>{subject.length} characters (60 recommended max)</span>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              {inputMode === 'html' ? 'Email HTML' : 'Email body'}
            </label>
            <textarea
              className={`${styles.bodyInput} ${inputMode === 'html' ? styles.bodyMono : ''}`}
              placeholder={inputMode === 'html'
                ? '<html>\n  <body>\n    Your email HTML here...\n  </body>\n</html>'
                : 'Paste your email content here. Plain text or HTML both work.'
              }
              value={body}
              onChange={(e) => { setBody(e.target.value); setInputError(''); }}
              disabled={phase === 'processing'}
              onKeyDown={handleKeyDown}
              rows={10}
              spellCheck={inputMode !== 'html'}
            />
          </div>

          {needsAuth && (
            <div className={styles.authPrompt}>
              <div className={styles.authPromptHead}>
                <span className={styles.authPromptTitle}>
                  Sign up to score this email
                </span>
                <span className={styles.authPromptBonus}>
                  {welcomeBonus} free credits
                </span>
              </div>
              <p className={styles.authPromptBody}>
                Scoring uses the Arcis AI engine, which costs real money to run. New accounts get {welcomeBonus} free credits - enough for {welcomeBonus} scans. No credit card required. Your input is saved while you sign up.
              </p>
              <div className={styles.authPromptActions}>
                <Link
                  to={`/signup?redirectTo=${encodeURIComponent('/score')}`}
                  className={styles.authPromptPrimary}
                >
                  Create free account
                </Link>
                <Link
                  to={`/login?redirectTo=${encodeURIComponent('/score')}`}
                  className={styles.authPromptSecondary}
                >
                  I have an account
                </Link>
              </div>
            </div>
          )}

          {inputError && !needsAuth && <p className={styles.errorText}>{inputError}</p>}

          <div className={styles.inputActions}>
            <button
              className={styles.scoreButton}
              onClick={handleScore}
              disabled={phase === 'processing' || !subject.trim() || !body.trim()}
            >
              {phase === 'processing' ? (
                <>
                  <span className={styles.spinner} />
                  Scoring...
                </>
              ) : previousScore !== null ? 'Re-Score Email' : 'Score Email'}
            </button>
            <span className={styles.shortcutHint}>Ctrl + Enter</span>
          </div>
        </div>
      )}

      {/* Processing Animation */}
      {phase === 'processing' && (
        <div className={styles.processingSection}>
          <p className={styles.processingLabel}>Analyzing your email...</p>
          <div className={styles.stepList}>
            {ANALYSIS_STEPS.map((step, i) => {
              const done = completedSteps.includes(i);
              const active = !done && completedSteps.length === i;
              return (
                <div key={i} className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}>
                  <span className={styles.stepIndicator}>
                    {done ? '\u2713' : active ? <span className={styles.stepDot} /> : ''}
                  </span>
                  <span className={styles.stepLabel}>{step}</span>
                </div>
              );
            })}
          </div>
          <p className={styles.poweredBy}>Powered by Arcis</p>
        </div>
      )}

      {/* Results */}
      {phase === 'results' && results && (
        <div ref={resultsRef} className={styles.resultsSection}>
          {/* Score gauge */}
          <div className={styles.gaugeArea}>
            <div className={styles.gauge} style={{ '--gauge-color': verdict.color }}>
              <span className={styles.gaugeNumber}>{animatedScore}</span>
              <span className={styles.gaugeVerdict} style={{ color: verdict.color }}>
                {verdict.label}
              </span>
            </div>

            {scoreDiff !== null && (
              <div className={styles.comparison}>
                <span className={styles.compPrev}>Previous: {previousScore}</span>
                <span className={`${styles.compDiff} ${scoreDiff >= 0 ? styles.compUp : styles.compDown}`}>
                  {scoreDiff >= 0 ? '+' : ''}{scoreDiff} points
                </span>
              </div>
            )}

            <p className={styles.summary}>{results.summary}</p>
          </div>

          {/* Category bars */}
          <div className={styles.categoryBars}>
            {results.categories.map((cat) => {
              const pct = (cat.score / cat.max) * 100;
              const barColor = pct >= 80 ? 'var(--trov-success)' : pct >= 60 ? 'var(--trov-warning)' : 'var(--trov-error)';
              return (
                <div key={cat.id} className={styles.barRow}>
                  <span className={styles.barLabel}>{cat.label}</span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: barsAnimated ? pct + '%' : '0%',
                        background: barColor,
                      }}
                    />
                  </div>
                  <span className={styles.barScore}>{cat.score}/{cat.max}</span>
                </div>
              );
            })}
          </div>

          {/* Issue cards */}
          {results.issues.length > 0 && (
            <div className={styles.issueSection}>
              <h3 className={styles.issueHeading}>
                {results.issues.length} {results.issues.length === 1 ? 'issue' : 'issues'} found
              </h3>
              <div className={styles.issueList}>
                {results.issues.map((issue, i) => (
                  <div key={i} className={`${styles.issueCard} ${styles['issue_' + issue.severity]}`}>
                    <div className={styles.issueHeader}>
                      <StatusIcon status={issue.severity} size={14} />
                      <span className={styles.issueTitle}>{issue.title}</span>
                      <span className={styles.issueCatBadge}>{issue.category}</span>
                    </div>
                    <p className={styles.issueMessage}>{issue.message}</p>
                    <p className={styles.issueFix}>
                      <strong>Fix:</strong> {issue.fix}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool chain links. Branches on score AND severity - a 73 with a
              critical issue is not "strong"; honor the gauge the user just
              read. */}
          {(() => {
            const hasCritical = (results.issues || []).some(
              (i) => i.severity === 'critical',
            );
            const isStrong = results.score >= 70 && !hasCritical;
            return (
              <div className={styles.toolChain}>
                {isStrong ? (
                  <Link to="/verify" className={styles.toolChainLink}>
                    Email looks strong. Is your contact list clean?
                    <ArrowRightSmall />
                    <span className={styles.toolChainTarget}>Email Verifier</span>
                  </Link>
                ) : (
                  <Link to="/domain" className={styles.toolChainLink}>
                    {hasCritical
                      ? 'Address the critical issues above. Domain setup also matters.'
                      : 'Your domain setup might also be affecting deliverability'}
                    <ArrowRightSmall />
                    <span className={styles.toolChainTarget}>Domain Checker</span>
                  </Link>
                )}
              </div>
            );
          })()}

          {/* Actions */}
          <div className={styles.resultActions}>
            <button className={styles.editButton} onClick={handleEdit}>
              Edit & Re-Score
            </button>
            <button className={styles.resetButton} onClick={handleReset}>
              Score a different email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}