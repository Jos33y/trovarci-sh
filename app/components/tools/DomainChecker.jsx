import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import styles from '~/styles/modules/tools/DomainChecker.module.css';

/* ── Icons (inline SVG, no library) ── */

function ShieldCheckIcon({ size = 20, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3L4 7v5c0 4.5 3.4 8.7 8 10 4.6-1.3 8-5.5 8-10V7l-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ size = 16, className, direction = 'down' }) {
  const rotation = direction === 'up' ? 'rotate(180)' : '';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ transform: rotation }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusIcon({ status, size = 16 }) {
  if (status === 'pass') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={styles.iconPass}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
  if (status === 'critical') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={styles.iconCritical}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  /* info */
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={styles.iconInfo}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v.5M12 11v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

/* Real results come from /api/tools/check-domain. The shape is defined
   server-side in app/utils/domainChecks.server.js. */


/* ── Scan step definitions (for animation) ── */

const SCAN_PHASES = [
  {
    categoryId: 'authentication',
    label: 'Email Authentication',
    steps: ['SPF', 'DKIM', 'DMARC', 'BIMI'],
  },
  {
    categoryId: 'mailServer',
    label: 'Mail Server',
    steps: ['MX Records', 'SMTP', 'Reverse DNS'],
  },
  {
    categoryId: 'reputation',
    label: 'Domain Reputation',
    steps: ['IP Blacklists (15)', 'Domain Blacklists', 'Safe Browsing'],
  },
  {
    categoryId: 'webSecurity',
    label: 'Web & Security',
    steps: ['SSL/TLS', 'HTTPS Redirect', 'Security Headers', 'Website'],
  },
  {
    categoryId: 'dnsConfig',
    label: 'DNS Configuration',
    steps: ['Nameservers', 'SOA', 'DNSSEC', 'CAA'],
  },
];

/* ── Helpers ── */

function getOverallLabel(status) {
  if (status === 'healthy') return 'Healthy';
  if (status === 'issues') return 'Issues Found';
  return 'Action Needed';
}

function getCategoryLabel(status) {
  if (status === 'healthy') return 'Healthy';
  if (status === 'issues') return 'Issues';
  return 'Action Needed';
}

function getWorstStatus(checks) {
  if (checks.some((c) => c.status === 'critical')) return 'critical';
  if (checks.some((c) => c.status === 'warning')) return 'issues';
  return 'healthy';
}

const PILL_LABELS = {
  authentication: 'Auth',
  mailServer: 'Mail',
  reputation: 'Reputation',
  webSecurity: 'Security',
  dnsConfig: 'DNS',
};

/* ── Component ── */

export default function DomainChecker() {
  const [domain, setDomain] = useState('');
  const [phase, setPhase] = useState('input'); /* input | scanning | results */
  const [scanProgress, setScanProgress] = useState([]);
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [domainError, setDomainError] = useState('');
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const toolRef = useRef(null);

  /* Domain validation */
  const validateDomain = useCallback((value) => {
    const trimmed = value.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '');
    const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
    return pattern.test(trimmed) ? trimmed : null;
  }, []);

  /* Start scan: kicks off real fetch AND visual animation concurrently. */
  const handleScan = useCallback(() => {
    const cleaned = validateDomain(domain);
    if (!cleaned) {
      setDomainError('Enter a valid domain like example.com');
      return;
    }
    setDomainError('');
    setPhase('scanning');
    setScanProgress([]);

    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    // Start the real API request immediately.
    const fetchPromise = fetch('/api/tools/check-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: cleaned }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data.result;
      });

    // Step through the visual animation alongside the fetch.
    let stepIndex = 0;
    const allSteps = SCAN_PHASES.flatMap((p) =>
      p.steps.map((step) => ({ categoryId: p.categoryId, label: p.label, step }))
    );
    const total = allSteps.length;

    const animationPromise = new Promise((resolve) => {
      scanIntervalRef.current = setInterval(() => {
        if (stepIndex >= total) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
          resolve();
          return;
        }
        setScanProgress((prev) => [...prev, allSteps[stepIndex]]);
        stepIndex++;
      }, 220);
    });

    // Show results only when BOTH the animation has played and the fetch is
    // back. Guarantees the scan animation is always visible, and that the
    // displayed results are real (never a blink of mock data).
    Promise.all([fetchPromise, animationPromise])
      .then(([realResult]) => {
        // Fast-forward any remaining steps (defensive; animation should be done).
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
        setResults(realResult);
        setPhase('results');
        const autoExpand = {};
        realResult.categories.forEach((cat) => {
          if (cat.status !== 'healthy') autoExpand[cat.id] = true;
        });
        setExpanded(autoExpand);
      })
      .catch((err) => {
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
        setPhase('input');
        setDomainError(
          err?.message?.includes('fetch') || err?.message?.includes('Network')
            ? 'Network error. Check your connection and try again.'
            : err?.message || 'Scan failed. Try again in a moment.'
        );
      });
  }, [domain, validateDomain]);

  /* Scroll to results when they appear */
  useEffect(() => {
    if (phase === 'results' && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [phase]);

  /* Cleanup interval on unmount */
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, []);

  /* Toggle category expand */
  const toggleCategory = useCallback((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  /* Reset */
  const handleReset = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setPhase('input');
    setResults(null);
    setExpanded({});
    setScanProgress([]);
    setTimeout(() => {
      if (toolRef.current) {
        const top = toolRef.current.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      }
      inputRef.current?.focus();
    }, 100);
  }, []);

  /* Key handler */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') handleScan();
    },
    [handleScan]
  );

  /* Get all issues across categories */
  const getAllIssues = useCallback(() => {
    if (!results) return [];
    return results.categories.flatMap((cat) =>
      cat.checks.flatMap((check) =>
        check.issues.map((issue) => ({ ...issue, categoryLabel: cat.label }))
      )
    );
  }, [results]);

  return (
    <div ref={toolRef} className={styles.tool}>
      {/* ── Tool Header ── */}
      <div className={styles.toolHeader}>
        <div className={styles.toolHeaderLeft}>
          <div className={styles.toolIcon}>
            <ShieldCheckIcon size={22} />
          </div>
          <div>
            <h2 className={styles.toolTitle}>Domain Health Checker</h2>
            <p className={styles.toolDesc}>Check your domain's email, DNS, and reputation health</p>
          </div>
        </div>
        <span className={styles.freeBadge}>Free</span>
      </div>

      {/* ── Input State ── */}
      {(phase === 'input' || phase === 'scanning') && (
        <div className={styles.inputSection}>
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              type="text"
              className={`${styles.domainInput} ${domainError ? styles.inputError : ''}`}
              placeholder="example.com"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setDomainError('');
              }}
              onKeyDown={handleKeyDown}
              disabled={phase === 'scanning'}
              autoComplete="off"
              spellCheck="false"
            />
            <button
              className={styles.scanButton}
              onClick={handleScan}
              disabled={phase === 'scanning' || !domain.trim()}
            >
              {phase === 'scanning' ? (
                <>
                  <span className={styles.spinner} />
                  Scanning...
                </>
              ) : (
                'Check Domain'
              )}
            </button>
          </div>
          {domainError && <p className={styles.errorText}>{domainError}</p>}
        </div>
      )}

      {/* ── Scan Animation ── */}
      {phase === 'scanning' && (
        <div className={styles.scanSection}>
          <p className={styles.scanLabel}>
            Scanning <strong>{validateDomain(domain) || domain}</strong>
          </p>
          <div className={styles.scanPhases}>
            {SCAN_PHASES.map((phaseItem) => {
              const completedSteps = scanProgress.filter(
                (s) => s && s.categoryId === phaseItem.categoryId
              );
              const isActive = completedSteps.length > 0 && completedSteps.length < phaseItem.steps.length;
              const isComplete = completedSteps.length === phaseItem.steps.length;
              const isWaiting = completedSteps.length === 0;

              return (
                <div
                  key={phaseItem.categoryId}
                  className={`${styles.scanPhase} ${isComplete ? styles.scanPhaseComplete : ''} ${isActive ? styles.scanPhaseActive : ''}`}
                >
                  <div className={styles.scanPhaseHeader}>
                    <span className={styles.scanPhaseLabel}>{phaseItem.label}</span>
                    <span className={styles.scanPhaseStatus}>
                      {isComplete && <span className={styles.scanCheck}>✓</span>}
                      {isActive && <span className={styles.scanDot} />}
                      {isWaiting && <span className={styles.scanWaiting}>Waiting</span>}
                    </span>
                  </div>
                  <div className={styles.scanBar}>
                    <div
                      className={styles.scanBarFill}
                      style={{
                        width: `${(completedSteps.length / phaseItem.steps.length) * 100}%`,
                      }}
                    />
                  </div>
                  {completedSteps.length > 0 && (
                    <div className={styles.scanSteps}>
                      {completedSteps.map((s, i) => (
                        <span key={i} className={styles.scanStepDone}>
                          {s.step} ✓
                        </span>
                      ))}
                      {isActive && phaseItem.steps[completedSteps.length] && (
                        <span className={styles.scanStepActive}>
                          {phaseItem.steps[completedSteps.length]}...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {phase === 'results' && results && (
        <div ref={resultsRef} className={styles.resultsSection}>
          {/* Overall verdict */}
          <div className={styles.verdictBar}>
            <div className={styles.verdictLeft}>
              <span className={styles.verdictDomain}>{results.domain}</span>
              {results.detectedProvider && (
                <span className={styles.verdictProvider}>{results.detectedProvider}</span>
              )}
            </div>
            <span className={`${styles.verdictBadge} ${styles[`verdict_${results.overall}`]}`}>
              {getOverallLabel(results.overall)}
            </span>
          </div>

          {/* Category pills */}
          <div className={styles.categoryPills}>
            {results.categories.map((cat) => (
              <button
                key={cat.id}
                className={`${styles.categoryPill} ${styles[`pill_${cat.status}`]}`}
                onClick={() => toggleCategory(cat.id)}
                aria-expanded={!!expanded[cat.id]}
              >
                <StatusIcon
                  status={cat.status === 'healthy' ? 'pass' : cat.status === 'issues' ? 'warning' : 'critical'}
                  size={14}
                />
                <span className={styles.pillLabel}>{PILL_LABELS[cat.id] || cat.label}</span>
              </button>
            ))}
          </div>

          {/* Category sections */}
          <div className={styles.categories}>
            {results.categories.map((cat) => (
              <div key={cat.id} className={styles.category}>
                <button
                  className={styles.categoryHeader}
                  onClick={() => toggleCategory(cat.id)}
                  aria-expanded={!!expanded[cat.id]}
                >
                  <div className={styles.categoryHeaderLeft}>
                    <ChevronIcon
                      size={16}
                      direction={expanded[cat.id] ? 'up' : 'down'}
                      className={styles.chevron}
                    />
                    <span className={styles.categoryName}>{cat.label}</span>
                  </div>
                  <span className={`${styles.categoryStatus} ${styles[`status_${cat.status}`]}`}>
                    {getCategoryLabel(cat.status)}
                  </span>
                </button>

                {expanded[cat.id] && (
                  <div className={styles.categoryBody}>
                    {cat.checks.map((check, i) => (
                      <div key={i} className={styles.checkRow}>
                        <div className={styles.checkHeader}>
                          <StatusIcon status={check.status} size={16} />
                          <span className={styles.checkName}>{check.name}</span>
                          <span className={styles.checkTitle}>{check.title}</span>
                        </div>
                        {check.detail && (
                          <p className={styles.checkDetail}>{check.detail}</p>
                        )}

                        {/* Issue cards */}
                        {check.issues.map((issue, j) => (
                          <div key={j} className={`${styles.issueCard} ${styles[`issue_${issue.severity}`]}`}>
                            <div className={styles.issueHeader}>
                              <StatusIcon status={issue.severity} size={14} />
                              <span className={styles.issueTitle}>{issue.title}</span>
                            </div>
                            <p className={styles.issueMessage}>{issue.message}</p>
                            {issue.fix && (
                              <div className={styles.issueFix}>
                                {issue.fix.type === 'tool' ? (
                                  <Link to={issue.fix.path} className={styles.issueFixLink}>
                                    {issue.fix.label}
                                    <ArrowRightSmall />
                                  </Link>
                                ) : (
                                  <a
                                    href={issue.fix.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.issueFixLink}
                                  >
                                    {issue.fix.label}
                                    <ArrowRightSmall />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Contextual next-tool links */}
          {getAllIssues().some((i) => i.severity === 'critical' || i.severity === 'warning') && (
            <div className={styles.toolChain}>
              {getAllIssues().some(
                (i) => i.categoryLabel === 'Email Authentication' && (i.severity === 'critical' || i.severity === 'warning')
              ) && (
                <Link to="/records" className={styles.toolChainLink}>
                  Fix authentication issues
                  <ArrowRightSmall />
                  <span className={styles.toolChainTarget}>DNS Generator</span>
                </Link>
              )}
              <Link to="/score" className={styles.toolChainLink}>
                Test your email content
                <ArrowRightSmall />
                <span className={styles.toolChainTarget}>Email Scorer</span>
              </Link>
            </div>
          )}

          {/* Scan again */}
          <button className={styles.resetButton} onClick={handleReset}>
            Check another domain
          </button>
        </div>
      )}
    </div>
  );
}