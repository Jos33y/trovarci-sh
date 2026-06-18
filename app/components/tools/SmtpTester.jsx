import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import styles from '~/styles/modules/tools/SmtpTester.module.css';

/* -- Icons -- */

function TerminalIcon({ size = 20, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="3" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 9l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ open, size = 16 }) {
  if (open) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function ChevronSmall({ size = 12, up }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: up ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -- Provider shortcuts -- */

const PROVIDERS = [
  { host: 'smtp.gmail.com', label: 'Google Workspace', port: 587, security: 'starttls' },
  { host: 'smtp.office365.com', label: 'Microsoft 365', port: 587, security: 'starttls' },
  { host: 'smtp-relay.gmail.com', label: 'Google Relay', port: 587, security: 'starttls' },
  { host: 'email-smtp.us-east-1.amazonaws.com', label: 'Amazon SES', port: 587, security: 'starttls' },
  { host: 'smtp.sendgrid.net', label: 'SendGrid', port: 587, security: 'starttls' },
  { host: 'smtp.mailgun.org', label: 'Mailgun', port: 587, security: 'starttls' },
  { host: 'smtp.postmarkapp.com', label: 'Postmark', port: 587, security: 'starttls' },
  { host: 'smtp-relay.brevo.com', label: 'Brevo', port: 587, security: 'starttls' },
  { host: 'smtp.zoho.com', label: 'Zoho Mail', port: 587, security: 'starttls' },
  { host: 'smtp.fastmail.com', label: 'Fastmail', port: 587, security: 'starttls' },
];

function getSecurityForPort(port) {
  if (port === 465) return 'ssl';
  if (port === 587) return 'starttls';
  if (port === 25) return 'none';
  return 'starttls';
}

/* -- Mock data: successful Gmail connection -- */

/* -- Shape reference --
   The /api/tools/test-smtp endpoint returns:
     {
       ok: true,
       steps: [{ name, label, status, duration, lines: [{type, text}], detail }],
       summary: { verdict, host, port, tlsVersion, tlsCipher, authMethod, maxSize, totalDuration, provider, message }
     }
   Shape is locked in app/lib/smtpTester.server.js. Credentials are redacted
   server-side before lines are emitted, so the client never renders raw passwords. */

/* Translate API error codes into user-facing sentences. Concrete next step
   where possible, no apologetic voice. */
function friendlyError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'RATE_LIMITED':
      if (err?.retryAfterSeconds) {
        const mins = Math.ceil(err.retryAfterSeconds / 60);
        return `Rate limit reached. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
      }
      return 'Rate limit reached. Try again shortly.';
    case 'BAD_REQUEST':
      return 'Request could not be processed. Check your inputs.';
    default:
      return err?.message || 'SMTP test failed. Check your inputs and try again.';
  }
}

/* -- Component -- */

export default function SmtpTester() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [security, setSecurity] = useState('starttls');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromAddr, setFromAddr] = useState('');
  const [testRecipient, setTestRecipient] = useState('test@trovarci.sh');
  const [timeoutSec, setTimeoutSec] = useState(10);
  const [detectedProvider, setDetectedProvider] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [phase, setPhase] = useState('input');
  const [visibleSteps, setVisibleSteps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [inputError, setInputError] = useState('');

  const stepTimerRef = useRef(null);
  const toolRef = useRef(null);
  const terminalRef = useRef(null);

  /* Provider detection on host change */
  const handleHostChange = useCallback((val) => {
    setHost(val);
    setInputError('');
    const lower = val.toLowerCase().trim();
    const match = PROVIDERS.find((p) => p.host === lower);
    if (match) {
      setDetectedProvider(match);
      setPort(match.port);
      setSecurity(match.security);
    } else {
      setDetectedProvider(null);
    }
    if (lower.length >= 2) {
      const hits = PROVIDERS.filter((p) =>
        p.host.includes(lower) || p.label.toLowerCase().includes(lower)
      );
      setSuggestions(hits.slice(0, 5));
      setShowSuggestions(hits.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  const selectProvider = useCallback((p) => {
    setHost(p.host);
    setPort(p.port);
    setSecurity(p.security);
    setDetectedProvider(p);
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  const handlePortChange = useCallback((val) => {
    const p = parseInt(val, 10);
    setPort(p);
    setSecurity(getSecurityForPort(p));
  }, []);

  const handleSecurityChange = useCallback((val) => {
    setSecurity(val);
    if (val === 'ssl') setPort(465);
    else if (val === 'starttls') setPort(587);
    else if (val === 'none') setPort(25);
  }, []);

  const validate = useCallback(() => {
    if (!host.trim()) return 'Enter an SMTP host';
    if (!username.trim()) return 'Enter a username';
    if (!password.trim()) return 'Enter a password';
    return '';
  }, [host, username, password]);

  const scrollToTool = useCallback(() => {
    if (toolRef.current) {
      const top = toolRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  /* Run test: fire the real API call AND run the visual reveal animation
     in parallel. Show the summary only when both finish, so users always
     see the terminal transcript animate (not a sudden "here's all 8 steps"
     dump from a fast local Gmail probe). */
  const handleTest = useCallback(() => {
    const err = validate();
    if (err) { setInputError(err); return; }
    setInputError('');
    setPhase('testing');
    setVisibleSteps([]);
    setSummary(null);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);

    const payload = {
      host: host.trim(),
      port: Number(port),
      security,
      username: username.trim(),
      password, // never trimmed - could be intentional
      from: fromAddr.trim() || undefined,
      to: testRecipient.trim() || undefined,
      timeoutSec: Number(timeoutSec) || 10,
    };

    const fetchPromise = fetch('/api/tools/test-smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));
      if (!res.ok || !data.ok) {
        const e = new Error(data.error || `HTTP ${res.status}`);
        e.code = data.code || `HTTP_${res.status}`;
        e.retryAfterSeconds = data.retryAfterSeconds;
        throw e;
      }
      return data;
    });

    setTimeout(scrollToTool, 50);

    // When steps arrive, animate their reveal at ~500ms per step.
    // Total animation is bounded so even an 8-step test finishes in ~4s.
    fetchPromise
      .then((data) => {
        // Defensively filter the response: the API always returns 8 real step
        // objects, but a malformed response or future schema change should
        // never crash the render tree.
        const steps = (Array.isArray(data.steps) ? data.steps : []).filter(
          (s) => s && typeof s === 'object' && typeof s.status === 'string'
        );
        if (steps.length === 0) {
          // No valid steps came back. Show the summary directly so the user
          // at least sees the verdict, and skip the reveal animation.
          setSummary(data.summary || { verdict: 'fail', message: 'No test steps returned' });
          setPhase('results');
          return;
        }
        let idx = 0;
        stepTimerRef.current = setInterval(() => {
          if (idx >= steps.length) {
            clearInterval(stepTimerRef.current);
            stepTimerRef.current = null;
            setTimeout(() => {
              setSummary(data.summary);
              setPhase('results');
            }, 300);
            return;
          }
          const step = steps[idx];
          idx++;
          if (!step) return; // belt-and-braces; filter above should prevent this
          setVisibleSteps((prev) => [...prev, step]);
        }, 500);
      })
      .catch((e) => {
        if (stepTimerRef.current) {
          clearInterval(stepTimerRef.current);
          stepTimerRef.current = null;
        }
        setPhase('input');
        setInputError(friendlyError(e));
      });
  }, [validate, scrollToTool, host, port, security, username, password, fromAddr, testRecipient, timeoutSec]);

  /* Auto-scroll terminal */
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [visibleSteps]);

  useEffect(() => { return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); }; }, []);

  const handleRetest = useCallback(() => {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setPhase('input');
    setVisibleSteps([]);
    setSummary(null);
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  const handleNewTest = useCallback(() => {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setPhase('input');
    setHost(''); setPort(587); setSecurity('starttls');
    setUsername(''); setPassword(''); setShowPassword(false);
    setDetectedProvider(null);
    setVisibleSteps([]); setSummary(null); setInputError('');
    setTimeout(scrollToTool, 50);
  }, [scrollToTool]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleTest();
  }, [handleTest]);

  const allPassed = summary && summary.verdict === 'pass';

  return (
    <div ref={toolRef} className={styles.tool}>
      {/* Tool Header */}
      <div className={styles.toolHeader}>
        <div className={styles.toolHeaderLeft}>
          <div className={styles.toolIcon}><TerminalIcon size={22} /></div>
          <div>
            <h2 className={styles.toolTitle}>SMTP Tester</h2>
            <p className={styles.toolDesc}>Test your SMTP connection step by step</p>
          </div>
        </div>
        <span className={styles.freeBadge}>FREE</span>
      </div>

      {/* Input */}
      {phase === 'input' && (
        <div className={styles.inputSection}>
          <p className={styles.privacyNote}>Credentials are used for this test only. Never stored, never logged.</p>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>SMTP Host</label>
            <div className={styles.hostWrapper}>
              <input type="text" className={styles.textInput} placeholder="smtp.gmail.com" value={host}
                autoComplete="off"
                onChange={(e) => handleHostChange(e.target.value)}
                onFocus={() => host.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={handleKeyDown} />
              {detectedProvider && <span className={styles.providerBadge}>{detectedProvider.label}</span>}
              {showSuggestions && suggestions.length > 0 && (
                <div className={styles.suggestionsDropdown}>
                  {suggestions.map((s) => (
                    <button key={s.host} className={styles.suggestionItem} onMouseDown={() => selectProvider(s)}>
                      <span className={styles.suggestionHost}>{s.host}</span>
                      <span className={styles.suggestionLabel}>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Port</label>
              <select className={styles.selectInput} value={port} onChange={(e) => handlePortChange(e.target.value)}>
                <option value={587}>587 (STARTTLS)</option>
                <option value={465}>465 (SSL/TLS)</option>
                <option value={25}>25 (Plain)</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Security</label>
              <select className={styles.selectInput} value={security} onChange={(e) => handleSecurityChange(e.target.value)}>
                <option value="starttls">STARTTLS</option>
                <option value="ssl">SSL/TLS</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Username</label>
            <input type="text" className={styles.textInput} placeholder="user@example.com" value={username}
              autoComplete="off" name="smtp-user"
              onChange={(e) => { setUsername(e.target.value); setInputError(''); }} onKeyDown={handleKeyDown} />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Password</label>
            <div className={styles.passwordWrapper}>
              <input type={showPassword ? 'text' : 'password'} className={`${styles.textInput} ${styles.passwordInput}`}
                placeholder="App password or SMTP key" value={password}
                autoComplete="new-password" name="smtp-pass"
                onChange={(e) => { setPassword(e.target.value); setInputError(''); }} onKeyDown={handleKeyDown} />
              <button type="button" className={styles.eyeButton} onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <button className={styles.advancedToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
            Advanced options <ChevronSmall up={showAdvanced} />
          </button>

          {showAdvanced && (
            <div className={styles.advancedPanel}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>From address</label>
                <input type="text" className={styles.textInput} placeholder={username || 'user@example.com'}
                  value={fromAddr} onChange={(e) => setFromAddr(e.target.value)} />
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Test recipient</label>
                  <input type="text" className={styles.textInput} value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Timeout (sec)</label>
                  <input type="number" className={styles.textInput} min={5} max={30} value={timeoutSec}
                    onChange={(e) => setTimeoutSec(parseInt(e.target.value, 10) || 10)} />
                </div>
              </div>
            </div>
          )}

          {inputError && <p className={styles.errorText}>{inputError}</p>}

          <div className={styles.inputActions}>
            <button className={styles.testButton} onClick={handleTest}
              disabled={!host.trim() || !username.trim() || !password.trim()}>
              Test Connection
            </button>
            <span className={styles.shortcutHint}>Ctrl + Enter</span>
          </div>
        </div>
      )}

      {/* Terminal Output */}
      {(phase === 'testing' || phase === 'results') && (
        <div className={styles.terminalSection}>
          <div className={styles.terminalHeader}>
            <span className={styles.termDot} /><span className={styles.termDot} /><span className={styles.termDot} />
            <span className={styles.terminalTitle}>SMTP Connection Test</span>
          </div>
          <div ref={terminalRef} className={styles.terminalBody}>
            {visibleSteps.filter((s) => s && typeof s.status === 'string').map((step, i) => (
              <div key={i} className={`${styles.termStep} ${styles['step_' + step.status]}`}>
                {(Array.isArray(step.lines) ? step.lines : []).map((line, j) => (
                  <div key={j} className={`${styles.termLine} ${styles['line_' + line.type]}`}>
                    <span className={styles.linePrefix}>
                      {line.type === 'sent' ? '\u2192' : line.type === 'recv' ? '\u2190' : '\u00a0'}
                    </span>
                    <span className={styles.lineText}>{line.text}</span>
                  </div>
                ))}
                <div className={`${styles.termStatus} ${styles['termStatus_' + step.status]}`}>
                  <span>{step.status === 'pass' ? '\u2713' : step.status === 'fail' ? '\u2717' : '-'}</span>
                  <span className={styles.lineText}>
                    <strong style={{ color: 'var(--trov-text)', fontWeight: 600 }}>{step.label}</strong>
                    {step.detail ? ` - ${step.detail}` : ''}
                  </span>
                  <span className={styles.termDuration}>{step.duration}ms</span>
                </div>
              </div>
            ))}
            {phase === 'testing' && !summary && (
              <div className={styles.termLoading}>
                <span className={styles.loadingDot} />
                <span>Testing next step...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {phase === 'results' && summary && (
        <div className={styles.summarySection}>
          <div className={`${styles.summaryCard} ${styles['summary_' + summary.verdict]}`}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryIcon}>{allPassed ? '\u2713' : '\u2717'}</span>
              <span className={styles.summaryTitle}>{allPassed ? 'Connection Successful' : 'Connection Failed'}</span>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Server</span>
                <span className={styles.summaryValue}>{summary.host}:{summary.port}</span>
              </div>
              {summary.tlsVersion && (
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Security</span>
                  <span className={styles.summaryValue}>
                    {summary.tlsCipher ? `${summary.tlsVersion} (${summary.tlsCipher})` : summary.tlsVersion}
                  </span>
                </div>
              )}
              {summary.authMethod && (
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Auth</span>
                  <span className={styles.summaryValue}>{summary.authMethod} accepted</span>
                </div>
              )}
              {summary.maxSize > 0 && (
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Max message</span>
                  <span className={styles.summaryValue}>{Math.round(summary.maxSize / 1024 / 1024)} MB</span>
                </div>
              )}
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Response time</span>
                <span className={styles.summaryValue}>{summary.totalDuration}ms</span>
              </div>
            </div>
            {allPassed
              ? <p className={styles.summaryMessage}>Your SMTP server is ready to send email.</p>
              : summary.message && <p className={styles.summaryMessage}>{summary.message}</p>
            }
          </div>

          {allPassed && (
            <div className={styles.toolChain}>
              <Link to="/domain" className={styles.toolChainLink}>
                SMTP is working. Check your domain health next
                <ArrowRightSmall />
                <span className={styles.toolChainTarget}>Domain Checker</span>
              </Link>
            </div>
          )}

          <div className={styles.resultActions}>
            <button className={styles.retestButton} onClick={handleRetest}>Test Again</button>
            <button className={styles.newTestButton} onClick={handleNewTest}>Test a different server</button>
          </div>
        </div>
      )}
    </div>
  );
}