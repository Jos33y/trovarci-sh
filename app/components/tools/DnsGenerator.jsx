import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import { CopyIcon, CheckIcon, DnsIcon } from '~/components/icons';
import styles from '~/styles/modules/tools/DnsGenerator.module.css';
import {
  PROVIDERS,
  SENDING_SERVICES,
  REGISTRARS,
  DMARC_POLICIES,
  validateDomain,
  validateReportEmail,
  validateDkimPublicKey,
  buildSpfRecord,
  buildDmarcRecord,
  getDkimRecords,
  buildMxRecords,
  buildBimiRecord,
  buildMtaStsRecords,
  registrarFormattingHint,
} from '~/utils/dnsRecords';

const TABS = [
  { id: 1, label: 'Provider' },
  { id: 2, label: 'Registrar' },
  { id: 3, label: 'Records' },
];

/* ══════════════════════════════════════════════
   Main component
   ══════════════════════════════════════════════ */

export default function DnsGenerator() {
  /* ─── Core state ─── */
  const [step, setStep] = useState(1);
  const [domainInput, setDomainInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [additionalProviders, setAdditionalProviders] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedRegistrar, setSelectedRegistrar] = useState(null);
  const [customSpf, setCustomSpf] = useState('');
  const [dkimPublicKey, setDkimPublicKey] = useState('');

  /* ─── DMARC state ─── */
  const [dmarcPolicy, setDmarcPolicy] = useState('none');
  const [dmarcReportEmail, setDmarcReportEmail] = useState('');
  const [dmarcPct, setDmarcPct] = useState(100);
  const [dmarcSubdomainPolicy, setDmarcSubdomainPolicy] = useState('inherit');
  const [dmarcForensicEmail, setDmarcForensicEmail] = useState('');
  const [dmarcAlignment, setDmarcAlignment] = useState('relaxed');
  const [dmarcAdvancedOpen, setDmarcAdvancedOpen] = useState(false);

  /* ─── Advanced (BIMI + MTA-STS) state ─── */
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bimiEnabled, setBimiEnabled] = useState(false);
  const [bimiLogoUrl, setBimiLogoUrl] = useState('');
  const [bimiVmcUrl, setBimiVmcUrl] = useState('');
  const [mtaStsEnabled, setMtaStsEnabled] = useState(false);
  const [mtaStsMode, setMtaStsMode] = useState('testing');
  const [mtaStsMaxAge, setMtaStsMaxAge] = useState(604800);
  const [mtaStsReportEmail, setMtaStsReportEmail] = useState('');

  /* ─── Ephemeral UI state ─── */
  const [copied, setCopied] = useState({});

  /* ─── Derived values ─── */
  const provider = useMemo(
    () => PROVIDERS.find((p) => p.id === selectedProvider) || null,
    [selectedProvider]
  );
  const registrar = useMemo(
    () => REGISTRARS.find((r) => r.id === selectedRegistrar) || null,
    [selectedRegistrar]
  );

  const domainValidation = useMemo(() => validateDomain(domainInput), [domainInput]);
  const domain = domainValidation.valid ? domainValidation.normalized : domainInput.trim();

  const reportEmailValidation = useMemo(
    () => validateReportEmail(dmarcReportEmail),
    [dmarcReportEmail]
  );
  const forensicEmailValidation = useMemo(
    () => validateReportEmail(dmarcForensicEmail),
    [dmarcForensicEmail]
  );
  const dkimKeyValidation = useMemo(
    () => validateDkimPublicKey(dkimPublicKey),
    [dkimPublicKey]
  );

  /* ─── Builders (memoized) ─── */
  const spf = useMemo(
    () =>
      buildSpfRecord({
        provider,
        additionalProviderIds: additionalProviders,
        serviceIds: selectedServices,
        customSpf,
      }),
    [provider, additionalProviders, selectedServices, customSpf]
  );

  const dmarc = useMemo(
    () =>
      buildDmarcRecord({
        policy: dmarcPolicy,
        subdomainPolicy: dmarcSubdomainPolicy,
        pct: dmarcPct,
        reportEmail: reportEmailValidation.valid ? reportEmailValidation.normalized : '',
        forensicEmail: forensicEmailValidation.valid ? forensicEmailValidation.normalized : '',
        alignment: dmarcAlignment,
        domain,
      }),
    [
      dmarcPolicy,
      dmarcSubdomainPolicy,
      dmarcPct,
      reportEmailValidation,
      forensicEmailValidation,
      dmarcAlignment,
      domain,
    ]
  );

  const dkimRecords = useMemo(
    () =>
      getDkimRecords({
        provider,
        domain,
        userPublicKey: dkimKeyValidation.valid ? dkimKeyValidation.normalized : '',
      }),
    [provider, domain, dkimKeyValidation]
  );

  const mx = useMemo(() => buildMxRecords({ provider, domain }), [provider, domain]);

  const bimi = useMemo(
    () =>
      bimiEnabled
        ? buildBimiRecord({
            logoUrl: bimiLogoUrl.trim(),
            vmcUrl: bimiVmcUrl.trim(),
            dmarcPolicy,
            dmarcPct,
          })
        : null,
    [bimiEnabled, bimiLogoUrl, bimiVmcUrl, dmarcPolicy, dmarcPct]
  );

  const mtaSts = useMemo(
    () =>
      mtaStsEnabled
        ? buildMtaStsRecords({
            mode: mtaStsMode,
            maxAge: Number(mtaStsMaxAge) || 604800,
            tlsReportEmail: mtaStsReportEmail.trim(),
            domain,
            provider,
          })
        : null,
    [mtaStsEnabled, mtaStsMode, mtaStsMaxAge, mtaStsReportEmail, domain, provider]
  );

  /* ─── Copy handler ─── */
  const handleCopy = useCallback((key, text) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopied((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopied((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  }, []);

  /* ─── Step navigation ─── */
  const canProceedStep1 = domainValidation.valid && !!selectedProvider;
  const canProceedStep2 = !!selectedRegistrar;

  const goToTab = useCallback(
    (tabId) => {
      if (tabId === 1) setStep(1);
      else if (tabId === 2 && canProceedStep1) setStep(2);
      else if (tabId === 3 && canProceedStep1 && canProceedStep2) setStep(3);
    },
    [canProceedStep1, canProceedStep2]
  );

  /* ─── Tab keyboard navigation (ArrowLeft / ArrowRight / Home / End) ─── */
  const tabRefs = useRef([]);
  const onTabKeyDown = useCallback(
    (e, index) => {
      const count = TABS.length;
      let nextIndex = null;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % count;
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = count - 1;
      if (nextIndex !== null) {
        e.preventDefault();
        tabRefs.current[nextIndex]?.focus();
      }
    },
    []
  );

  /* ─── Scroll to top on step change (fixes an existing UX issue) ─── */
  const toolRef = useRef(null);
  useEffect(() => {
    if (!toolRef.current) return;
    const rect = toolRef.current.getBoundingClientRect();
    if (rect.top < 0) {
      toolRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [step]);

  /* ─── Plain-text "Copy all" output ─── */
  const buildAllRecordsText = useCallback(() => {
    const lines = [];
    lines.push(`DNS Records for ${domain || 'yourdomain.com'}`);
    lines.push(`Primary provider: ${provider?.name || 'Custom'}`);
    if (registrar) lines.push(`Registrar: ${registrar.name}`);
    lines.push('');

    if (mx.records.length > 0) {
      lines.push('--- MX Records ---');
      for (const r of mx.records) {
        lines.push(`Priority ${r.priority}  ${r.host}`);
      }
      lines.push('');
    }

    lines.push('--- SPF ---');
    lines.push('Type: TXT');
    lines.push('Host: @');
    lines.push(`Value: ${spf.record}`);
    lines.push(`DNS lookups: ${spf.totalLookups} of 10`);
    lines.push('');

    if (dkimRecords.length > 0) {
      dkimRecords.forEach((rec, i) => {
        lines.push(`--- DKIM ${dkimRecords.length > 1 ? i + 1 : ''}`.trimEnd() + ' ---');
        lines.push(`Type: ${rec.type}`);
        lines.push(`Host: ${rec.host}`);
        lines.push(`Value: ${rec.value}`);
        lines.push('');
      });
    }

    lines.push('--- DMARC ---');
    lines.push('Type: TXT');
    lines.push('Host: _dmarc');
    lines.push(`Value: ${dmarc.record}`);
    lines.push('');

    if (bimi) {
      lines.push('--- BIMI ---');
      lines.push('Type: TXT');
      lines.push(`Host: ${bimi.host}`);
      lines.push(`Value: ${bimi.record}`);
      lines.push('');
    }

    if (mtaSts) {
      lines.push('--- MTA-STS (TXT) ---');
      lines.push('Type: TXT');
      lines.push(`Host: ${mtaSts.txtRecord.host}`);
      lines.push(`Value: ${mtaSts.txtRecord.value}`);
      lines.push('');
      lines.push('--- MTA-STS Policy File ---');
      lines.push(`Host at: ${mtaSts.policyFile.url}`);
      lines.push('Content:');
      lines.push(mtaSts.policyFile.content);
      lines.push('');
      if (mtaSts.tlsReporting) {
        lines.push('--- TLS Reporting ---');
        lines.push('Type: TXT');
        lines.push(`Host: ${mtaSts.tlsReporting.host}`);
        lines.push(`Value: ${mtaSts.tlsReporting.value}`);
      }
    }

    return lines.join('\n');
  }, [domain, provider, registrar, mx, spf, dkimRecords, dmarc, bimi, mtaSts]);

  /* ─── SPF status for the completion banner ─── */
  const spfStatus = useMemo(() => {
    if (spf.totalLookups > 10) return { tone: 'error', label: 'Over limit' };
    if (spf.totalLookups > 8) return { tone: 'warning', label: `${spf.totalLookups}/10 lookups` };
    return { tone: 'ok', label: 'OK' };
  }, [spf.totalLookups]);

  const dmarcStrength = useMemo(() => {
    const p = DMARC_POLICIES.find((x) => x.id === dmarcPolicy);
    if (!p) return 1;
    return p.strength;
  }, [dmarcPolicy]);

  /* ─────────────────────────────────── RENDER ─────────────────────────────────── */

  return (
    <div className={styles.toolCard} ref={toolRef}>
      {/* ── Card Header ── */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.cardIcon}>
            <DnsIcon size={18} />
          </span>
          <div>
            <h1 className={styles.cardTitle}>DNS Record Generator</h1>
            <p className={styles.cardDesc}>
              Generate SPF, DKIM, DMARC, MX, BIMI and MTA-STS records for your domain
            </p>
          </div>
        </div>
        <span className={styles.freeBadge}>Free</span>
      </div>

      {/* ── Tab Bar (role=tablist with ArrowKey support) ── */}
      <div className={styles.tabBar} role="tablist" aria-label="Generator steps">
        {TABS.map((tab, i) => {
          const isActive = step === tab.id;
          const isDone = step > tab.id;
          const canClick =
            tab.id === 1 ||
            (tab.id === 2 && canProceedStep1) ||
            (tab.id === 3 && canProceedStep1 && canProceedStep2);
          return (
            <button
              key={tab.id}
              ref={(el) => (tabRefs.current[i] = el)}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${isDone ? styles.tabDone : ''}`}
              onClick={() => goToTab(tab.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              disabled={!canClick && !isDone}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'step' : undefined}
              tabIndex={isActive ? 0 : -1}
              id={`dns-tab-${tab.id}`}
              aria-controls={`dns-panel-${tab.id}`}
            >
              {isDone && <CheckMark />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      <div className={styles.toolBody}>
        {step === 1 && (
          <StepOne
            domainInput={domainInput}
            setDomainInput={setDomainInput}
            domainValidation={domainValidation}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            additionalProviders={additionalProviders}
            setAdditionalProviders={setAdditionalProviders}
            selectedServices={selectedServices}
            setSelectedServices={setSelectedServices}
            customSpf={customSpf}
            setCustomSpf={setCustomSpf}
            dkimPublicKey={dkimPublicKey}
            setDkimPublicKey={setDkimPublicKey}
            dkimKeyValidation={dkimKeyValidation}
            spf={spf}
            provider={provider}
            canProceed={canProceedStep1}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepTwo
            selectedRegistrar={selectedRegistrar}
            setSelectedRegistrar={setSelectedRegistrar}
            dmarcPolicy={dmarcPolicy}
            setDmarcPolicy={setDmarcPolicy}
            dmarcReportEmail={dmarcReportEmail}
            setDmarcReportEmail={setDmarcReportEmail}
            reportEmailValidation={reportEmailValidation}
            domain={domain}
            dmarcPct={dmarcPct}
            setDmarcPct={setDmarcPct}
            dmarcSubdomainPolicy={dmarcSubdomainPolicy}
            setDmarcSubdomainPolicy={setDmarcSubdomainPolicy}
            dmarcForensicEmail={dmarcForensicEmail}
            setDmarcForensicEmail={setDmarcForensicEmail}
            forensicEmailValidation={forensicEmailValidation}
            dmarcAlignment={dmarcAlignment}
            setDmarcAlignment={setDmarcAlignment}
            dmarcAdvancedOpen={dmarcAdvancedOpen}
            setDmarcAdvancedOpen={setDmarcAdvancedOpen}
            dmarc={dmarc}
            canProceed={canProceedStep2}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepThree
            domain={domain}
            provider={provider}
            registrar={registrar}
            additionalProviders={additionalProviders}
            dmarcPolicy={dmarcPolicy}
            dmarcStrength={dmarcStrength}
            spf={spf}
            spfStatus={spfStatus}
            dmarc={dmarc}
            dkimRecords={dkimRecords}
            mx={mx}
            bimi={bimi}
            mtaSts={mtaSts}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            bimiEnabled={bimiEnabled}
            setBimiEnabled={setBimiEnabled}
            bimiLogoUrl={bimiLogoUrl}
            setBimiLogoUrl={setBimiLogoUrl}
            bimiVmcUrl={bimiVmcUrl}
            setBimiVmcUrl={setBimiVmcUrl}
            mtaStsEnabled={mtaStsEnabled}
            setMtaStsEnabled={setMtaStsEnabled}
            mtaStsMode={mtaStsMode}
            setMtaStsMode={setMtaStsMode}
            mtaStsMaxAge={mtaStsMaxAge}
            setMtaStsMaxAge={setMtaStsMaxAge}
            mtaStsReportEmail={mtaStsReportEmail}
            setMtaStsReportEmail={setMtaStsReportEmail}
            copied={copied}
            onCopy={handleCopy}
            onCopyAll={() => handleCopy('all', buildAllRecordsText())}
            onBack={() => setStep(2)}
          />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Step 1: Provider + services + optional DKIM key
   ══════════════════════════════════════════════ */

function StepOne({
  domainInput,
  setDomainInput,
  domainValidation,
  selectedProvider,
  setSelectedProvider,
  additionalProviders,
  setAdditionalProviders,
  selectedServices,
  setSelectedServices,
  customSpf,
  setCustomSpf,
  dkimPublicKey,
  setDkimPublicKey,
  dkimKeyValidation,
  spf,
  provider,
  canProceed,
  onNext,
}) {
  const hasDomain = domainInput.trim().length > 0;
  const showDomainError = hasDomain && !domainValidation.valid;

  return (
    <div className={styles.stepContent} role="tabpanel" id="dns-panel-1" aria-labelledby="dns-tab-1">
      {/* Domain input */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="domain-input">
          Your domain
        </label>
        <input
          id="domain-input"
          type="text"
          className={styles.domainInput}
          placeholder="example.com"
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
          autoComplete="off"
          spellCheck="false"
          aria-invalid={showDomainError || undefined}
          aria-describedby={showDomainError ? 'domain-error' : undefined}
        />
        {showDomainError && (
          <p id="domain-error" className={styles.inlineError} role="alert">
            {domainValidation.error}
          </p>
        )}
      </div>

      {/* Provider grid */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Email provider</label>
        <div className={styles.optionGrid}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.optionCard} ${selectedProvider === p.id ? styles.optionSelected : ''}`}
              onClick={() => {
                setSelectedProvider(p.id);
                setAdditionalProviders((prev) => prev.filter((id) => id !== p.id));
              }}
              aria-pressed={selectedProvider === p.id}
            >
              <span className={styles.optionName}>{p.name}</span>
              <span className={styles.optionDesc}>{p.desc}</span>
              {selectedProvider === p.id && !p.spfCustom && (
                <span className={styles.spfContrib}>
                  {p.spfRaw ? p.spfRaw : `include:${p.spfInclude}`}
                  {p.spfLookupCost ? ` (${p.spfLookupCost} lookup${p.spfLookupCost !== 1 ? 's' : ''})` : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom SPF input when Custom provider selected */}
      {selectedProvider === 'custom' && (
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="custom-spf">
            SPF include or IP
            <span className={styles.labelHint}>
              For example: include:mail.yourdomain.com, ip4:192.168.1.1, or a mechanism like a or mx
            </span>
          </label>
          <input
            id="custom-spf"
            type="text"
            className={styles.input}
            placeholder="include:mail.yourdomain.com"
            value={customSpf}
            onChange={(e) => setCustomSpf(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
        </div>
      )}

      {/* Additional providers */}
      {selectedProvider && selectedProvider !== 'custom' && (
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            Also hosting email on
            <span className={styles.labelHint}>Optional. Adds their SPF include to your record.</span>
          </label>
          <div className={styles.chipRow}>
            {PROVIDERS.filter((p) => p.id !== selectedProvider && p.id !== 'custom').map((p) => {
              const isActive = additionalProviders.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                  onClick={() => {
                    setAdditionalProviders((prev) =>
                      isActive ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                    );
                  }}
                  aria-pressed={isActive}
                >
                  {isActive && <CheckMark />}
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sending services */}
      {selectedProvider && (
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            Also sending through
            <span className={styles.labelHint}>Transactional or bulk email services. Adds their SPF include.</span>
          </label>
          <div className={styles.chipRow}>
            {SENDING_SERVICES.map((s) => {
              const isActive = selectedServices.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                  onClick={() => {
                    setSelectedServices((prev) =>
                      isActive ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                    );
                  }}
                  aria-pressed={isActive}
                >
                  {isActive && <CheckMark />}
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional DKIM public key */}
      {provider && provider.dkim.type === 'txt' && (
        <details className={styles.inlineAccordion}>
          <summary className={styles.inlineAccordionSummary}>
            Paste DKIM public key (optional)
          </summary>
          <div className={styles.inlineAccordionBody}>
            <p className={styles.inlineAccordionNote}>
              {provider.dkim.setupUrl ? (
                <>
                  Retrieve the public key from{' '}
                  <a href={provider.dkim.setupUrl} target="_blank" rel="noopener noreferrer">
                    {provider.name} DKIM setup
                  </a>
                  , paste it below, and the record will be formatted with 255-character quoted segments per RFC 6376.
                </>
              ) : (
                <>
                  Paste the public key value from your provider's admin panel. The record will be
                  formatted with 255-character quoted segments per RFC 6376.
                </>
              )}
            </p>
            <textarea
              className={styles.keyInput}
              placeholder="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ..."
              value={dkimPublicKey}
              onChange={(e) => setDkimPublicKey(e.target.value)}
              rows={3}
              spellCheck="false"
              aria-invalid={dkimPublicKey && !dkimKeyValidation.valid ? true : undefined}
            />
            {dkimPublicKey && !dkimKeyValidation.valid && (
              <p className={styles.inlineError} role="alert">
                {dkimKeyValidation.error}
              </p>
            )}
          </div>
        </details>
      )}

      {/* Live SPF preview with lookup counter */}
      {selectedProvider && (
        <LivePreview
          label="SPF Record"
          record={spf.record}
          meta={`${spf.totalLookups} of 10 lookups / ${spf.sources.length} source${spf.sources.length !== 1 ? 's' : ''}`}
          tone={
            spf.totalLookups > 10 ? 'error' : spf.totalLookups > 8 ? 'warning' : 'ok'
          }
          warnings={spf.warnings}
          sources={spf.sources}
        />
      )}

      <div className={styles.stepFooter}>
        <button className={styles.nextBtn} disabled={!canProceed} onClick={onNext}>
          Continue
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Step 2: Registrar + DMARC
   ══════════════════════════════════════════════ */

function StepTwo({
  selectedRegistrar,
  setSelectedRegistrar,
  dmarcPolicy,
  setDmarcPolicy,
  dmarcReportEmail,
  setDmarcReportEmail,
  reportEmailValidation,
  domain,
  dmarcPct,
  setDmarcPct,
  dmarcSubdomainPolicy,
  setDmarcSubdomainPolicy,
  dmarcForensicEmail,
  setDmarcForensicEmail,
  forensicEmailValidation,
  dmarcAlignment,
  setDmarcAlignment,
  dmarcAdvancedOpen,
  setDmarcAdvancedOpen,
  dmarc,
  canProceed,
  onBack,
  onNext,
}) {
  return (
    <div className={styles.stepContent} role="tabpanel" id="dns-panel-2" aria-labelledby="dns-tab-2">
      {/* Registrar */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>DNS registrar</label>
        <div className={styles.optionGrid}>
          {REGISTRARS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`${styles.optionCard} ${selectedRegistrar === r.id ? styles.optionSelected : ''}`}
              onClick={() => setSelectedRegistrar(r.id)}
              aria-pressed={selectedRegistrar === r.id}
            >
              <span className={styles.optionName}>{r.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* DMARC policy */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          DMARC policy
          <span className={styles.labelHint}>
            Start at None, review reports for 2-4 weeks, then ramp to Quarantine at pct=10, then 25, 50, 100, and finally Reject.
          </span>
        </label>
        <div className={styles.policyOptions}>
          {DMARC_POLICIES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.policyCard} ${dmarcPolicy === p.id ? styles.policySelected : ''}`}
              onClick={() => setDmarcPolicy(p.id)}
              aria-pressed={dmarcPolicy === p.id}
            >
              <span className={styles.policyLabel}>{p.label}</span>
              <span className={styles.policyDesc}>{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Report email */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="dmarc-email">
          DMARC report email
          <span className={styles.labelHint}>
            Where aggregate reports are sent. Defaults to dmarc@{domain || 'yourdomain.com'}
          </span>
        </label>
        <input
          id="dmarc-email"
          type="email"
          className={styles.input}
          placeholder={`dmarc@${domain || 'yourdomain.com'}`}
          value={dmarcReportEmail}
          onChange={(e) => setDmarcReportEmail(e.target.value)}
          autoComplete="off"
          aria-invalid={dmarcReportEmail && !reportEmailValidation.valid ? true : undefined}
        />
        {dmarcReportEmail && !reportEmailValidation.valid && (
          <p className={styles.inlineError} role="alert">{reportEmailValidation.error}</p>
        )}
      </div>

      {/* Advanced DMARC controls */}
      <details
        className={styles.inlineAccordion}
        open={dmarcAdvancedOpen}
        onToggle={(e) => setDmarcAdvancedOpen(e.target.open)}
      >
        <summary className={styles.inlineAccordionSummary}>Advanced DMARC tags</summary>
        <div className={styles.inlineAccordionBody}>
          <div className={styles.advancedGrid}>
            {/* pct */}
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="dmarc-pct">
                Percentage (pct)
                <span className={styles.labelHint}>
                  How much failing mail is subject to the policy. Use for gradual rollout.
                </span>
              </label>
              <input
                id="dmarc-pct"
                type="number"
                min="0"
                max="100"
                step="1"
                className={styles.input}
                value={dmarcPct}
                onChange={(e) => setDmarcPct(Number(e.target.value))}
              />
            </div>

            {/* Subdomain policy */}
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="dmarc-sp">
                Subdomain policy (sp)
                <span className={styles.labelHint}>
                  Overrides the main policy for subdomains. Inherit means no override.
                </span>
              </label>
              <select
                id="dmarc-sp"
                className={styles.input}
                value={dmarcSubdomainPolicy}
                onChange={(e) => setDmarcSubdomainPolicy(e.target.value)}
              >
                <option value="inherit">Inherit parent policy</option>
                <option value="none">None</option>
                <option value="quarantine">Quarantine</option>
                <option value="reject">Reject</option>
              </select>
            </div>

            {/* Alignment */}
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="dmarc-alignment">
                Alignment mode
                <span className={styles.labelHint}>
                  Relaxed matches organisational domain; strict requires exact domain match.
                </span>
              </label>
              <select
                id="dmarc-alignment"
                className={styles.input}
                value={dmarcAlignment}
                onChange={(e) => setDmarcAlignment(e.target.value)}
              >
                <option value="relaxed">Relaxed (adkim=r, aspf=r)</option>
                <option value="strict">Strict (adkim=s, aspf=s)</option>
              </select>
            </div>

            {/* Forensic email */}
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="dmarc-ruf">
                Forensic report email (ruf)
                <span className={styles.labelHint}>
                  Optional. Receives detailed failure reports. Supported by few providers.
                </span>
              </label>
              <input
                id="dmarc-ruf"
                type="email"
                className={styles.input}
                placeholder="forensic@yourdomain.com"
                value={dmarcForensicEmail}
                onChange={(e) => setDmarcForensicEmail(e.target.value)}
                aria-invalid={dmarcForensicEmail && !forensicEmailValidation.valid ? true : undefined}
              />
              {dmarcForensicEmail && !forensicEmailValidation.valid && (
                <p className={styles.inlineError} role="alert">{forensicEmailValidation.error}</p>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* Live DMARC preview */}
      <LivePreview
        label="DMARC Record"
        record={dmarc.record}
        meta={`Policy: ${dmarcPolicy}`}
        tone="ok"
        warnings={dmarc.warnings}
      />

      <div className={styles.stepFooter}>
        <button className={styles.backBtn} onClick={onBack}>Back</button>
        <button className={styles.nextBtn} disabled={!canProceed} onClick={onNext}>
          Generate Records
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Step 3: Generated records
   ══════════════════════════════════════════════ */

function StepThree({
  domain,
  provider,
  registrar,
  additionalProviders,
  dmarcPolicy,
  dmarcStrength,
  spf,
  spfStatus,
  dmarc,
  dkimRecords,
  mx,
  bimi,
  mtaSts,
  advancedOpen,
  setAdvancedOpen,
  bimiEnabled,
  setBimiEnabled,
  bimiLogoUrl,
  setBimiLogoUrl,
  bimiVmcUrl,
  setBimiVmcUrl,
  mtaStsEnabled,
  setMtaStsEnabled,
  mtaStsMode,
  setMtaStsMode,
  mtaStsMaxAge,
  setMtaStsMaxAge,
  mtaStsReportEmail,
  setMtaStsReportEmail,
  copied,
  onCopy,
  onCopyAll,
  onBack,
}) {
  const registrarHint = registrar ? registrarFormattingHint(registrar.id) : null;
  const coreRecordCount = mx.records.length + 1 + dkimRecords.length + 1; // MX + SPF + DKIM + DMARC

  return (
    <div className={styles.stepContent} role="tabpanel" id="dns-panel-3" aria-labelledby="dns-tab-3">
      {/* Completion banner with real status */}
      <div className={styles.healthBanner}>
        <div className={styles.healthChecks}>
          <HealthItem tone={spfStatus.tone} label="SPF" detail={spfStatus.label} />
          <HealthItem
            tone={dkimRecords.length > 0 || provider?.dkim.type === 'manual' ? 'ok' : 'warning'}
            label="DKIM"
            detail={
              provider?.dkim.type === 'manual'
                ? 'Manual'
                : dkimRecords.length > 0
                ? `${dkimRecords.length} record${dkimRecords.length !== 1 ? 's' : ''}`
                : 'None'
            }
          />
          <HealthItem
            tone={dmarcStrength >= 2 ? 'ok' : 'warning'}
            label="DMARC"
            detail={dmarcPolicy}
          />
        </div>
        <span className={styles.healthText}>
          {coreRecordCount} record{coreRecordCount !== 1 ? 's' : ''} ready for {domain || 'your domain'}
        </span>
      </div>

      <div className={styles.resultHeader}>
        <div>
          <h3 className={styles.resultTitle}>{domain || 'yourdomain.com'}</h3>
          <p className={styles.resultMeta}>
            {provider?.name}
            {additionalProviders.length > 0 ? ` + ${additionalProviders.length} more` : ''} / {registrar?.name} / {dmarcPolicy}
          </p>
        </div>
        <button className={styles.copyAllBtn} onClick={onCopyAll} aria-live="polite">
          {copied.all ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {copied.all ? 'Copied all' : 'Copy all records'}
        </button>
      </div>

      {/* Registrar instructions */}
      {registrar && (
        <details className={styles.instructions}>
          <summary className={styles.instructionsSummary}>
            How to add these in {registrar.name}
          </summary>
          <ol className={styles.instructionsList}>
            {registrar.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {registrarHint && <p className={styles.registrarHint}>{registrarHint}</p>}
        </details>
      )}

      {/* MX records */}
      {mx.records.length > 0 && (
        <>
          <div className={styles.dkimHeader}>
            <h4 className={styles.recordSectionTitle}>MX</h4>
            {mx.note && <p className={styles.dkimNote}>{mx.note}</p>}
          </div>
          <div className={styles.mxGroup}>
            {mx.records.map((rec, i) => (
              <RecordCard
                key={`mx-${i}`}
                label="MX"
                type="MX"
                host="@"
                value={`${rec.priority} ${rec.host}`}
                note={
                  mx.records.length > 1
                    ? `Priority ${rec.priority}. Lower priority is tried first.`
                    : null
                }
                copied={copied}
                onCopy={onCopy}
                copyKey={`mx-${i}`}
              />
            ))}
          </div>
        </>
      )}

      {/* SPF record with source breakdown */}
      <RecordCard
        label="SPF"
        type="TXT"
        host="@"
        value={spf.record}
        note="Authorises email providers and services to send mail on behalf of your domain."
        copied={copied}
        onCopy={onCopy}
        copyKey="spf"
        extra={
          <SpfSourceBreakdown sources={spf.sources} totalLookups={spf.totalLookups} warnings={spf.warnings} />
        }
      />

      {/* DKIM records */}
      {dkimRecords.length > 0 ? (
        <>
          <div className={styles.dkimHeader}>
            <h4 className={styles.recordSectionTitle}>DKIM</h4>
            <p className={styles.dkimNote}>{provider.dkim.instructions}</p>
            {provider.dkim.setupUrl && (
              <a
                className={styles.dkimLink}
                href={provider.dkim.setupUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {provider.name} DKIM setup
                <ExternalIcon />
              </a>
            )}
          </div>
          {dkimRecords.map((rec, i) => (
            <RecordCard
              key={`dkim-${i}`}
              label={`DKIM ${dkimRecords.length > 1 ? i + 1 : ''}`.trimEnd()}
              type={rec.type}
              host={rec.host}
              value={rec.value}
              note={rec.note}
              copied={copied}
              onCopy={onCopy}
              copyKey={`dkim-${i}`}
              statusBadge={
                rec.status === 'provider_generated'
                  ? { label: 'Needs admin action', tone: 'warning' }
                  : null
              }
            />
          ))}
        </>
      ) : provider?.dkim.type === 'manual' ? (
        <div className={styles.manualNote}>
          <h4 className={styles.recordSectionTitle}>DKIM</h4>
          <p className={styles.dkimNote}>{provider.dkim.instructions}</p>
        </div>
      ) : null}

      {/* DMARC record */}
      <RecordCard
        label="DMARC"
        type="TXT"
        host="_dmarc"
        value={dmarc.record}
        note={`Policy: ${dmarcPolicy}. ${
          dmarc.tags.find((t) => t.startsWith('rua=')) || ''
        }`}
        copied={copied}
        onCopy={onCopy}
        copyKey="dmarc"
        warnings={dmarc.warnings}
      />

      {/* Advanced section: BIMI + MTA-STS */}
      <details
        className={styles.advancedSection}
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen(e.target.open)}
      >
        <summary className={styles.advancedSectionSummary}>
          <span>Advanced: BIMI and MTA-STS</span>
          <span className={styles.advancedMeta}>
            {(bimiEnabled ? 1 : 0) + (mtaStsEnabled ? 1 : 0)} of 2 configured
          </span>
        </summary>

        <div className={styles.advancedSectionBody}>
          {/* BIMI */}
          <div className={styles.advancedBlock}>
            <div className={styles.advancedBlockHeader}>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={bimiEnabled}
                  onChange={(e) => setBimiEnabled(e.target.checked)}
                />
                <span className={styles.toggleLabel}>BIMI (logo in inbox)</span>
              </label>
              <p className={styles.advancedBlockDesc}>
                Displays your brand logo next to messages in supporting inboxes. Requires DMARC
                enforcement (p=quarantine or p=reject at pct=100) and typically a Verified Mark
                Certificate for Gmail coverage.
              </p>
            </div>
            {bimiEnabled && (
              <div className={styles.advancedBlockFields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="bimi-logo">
                    Logo URL (SVG Tiny P/S over HTTPS)
                  </label>
                  <input
                    id="bimi-logo"
                    type="url"
                    className={styles.input}
                    placeholder="https://yourdomain.com/brand/logo.svg"
                    value={bimiLogoUrl}
                    onChange={(e) => setBimiLogoUrl(e.target.value)}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="bimi-vmc">
                    VMC URL (optional)
                    <span className={styles.labelHint}>
                      HTTPS URL to your Verified Mark Certificate PEM. Required for Gmail logo display.
                    </span>
                  </label>
                  <input
                    id="bimi-vmc"
                    type="url"
                    className={styles.input}
                    placeholder="https://yourdomain.com/brand/vmc.pem"
                    value={bimiVmcUrl}
                    onChange={(e) => setBimiVmcUrl(e.target.value)}
                  />
                </div>
                {bimi && (
                  <RecordCard
                    label="BIMI"
                    type="TXT"
                    host={bimi.host}
                    value={bimi.record}
                    note="Publishes your brand logo and optional VMC to supporting mailbox providers."
                    copied={copied}
                    onCopy={onCopy}
                    copyKey="bimi"
                    warnings={bimi.warnings}
                  />
                )}
              </div>
            )}
          </div>

          {/* MTA-STS */}
          <div className={styles.advancedBlock}>
            <div className={styles.advancedBlockHeader}>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={mtaStsEnabled}
                  onChange={(e) => setMtaStsEnabled(e.target.checked)}
                />
                <span className={styles.toggleLabel}>MTA-STS and TLS Reporting</span>
              </label>
              <p className={styles.advancedBlockDesc}>
                Enforces TLS encryption between mail servers and reports TLS failures. Requires
                hosting a policy file at a dedicated mta-sts subdomain with a valid HTTPS certificate.
              </p>
            </div>
            {mtaStsEnabled && (
              <div className={styles.advancedBlockFields}>
                <div className={styles.advancedGrid}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="mtasts-mode">Mode</label>
                    <select
                      id="mtasts-mode"
                      className={styles.input}
                      value={mtaStsMode}
                      onChange={(e) => setMtaStsMode(e.target.value)}
                    >
                      <option value="testing">Testing (log failures, still deliver)</option>
                      <option value="enforce">Enforce (block on TLS failure)</option>
                      <option value="none">None (disable policy)</option>
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="mtasts-maxage">
                      max_age (seconds)
                      <span className={styles.labelHint}>
                        604800 = 1 week, 2592000 = 30 days
                      </span>
                    </label>
                    <input
                      id="mtasts-maxage"
                      type="number"
                      min="86400"
                      step="86400"
                      className={styles.input}
                      value={mtaStsMaxAge}
                      onChange={(e) => setMtaStsMaxAge(Number(e.target.value))}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="mtasts-report">
                      TLS reporting email (optional)
                    </label>
                    <input
                      id="mtasts-report"
                      type="email"
                      className={styles.input}
                      placeholder="tls-reports@yourdomain.com"
                      value={mtaStsReportEmail}
                      onChange={(e) => setMtaStsReportEmail(e.target.value)}
                    />
                  </div>
                </div>

                {mtaSts && (
                  <>
                    <RecordCard
                      label="MTA-STS"
                      type="TXT"
                      host={mtaSts.txtRecord.host}
                      value={mtaSts.txtRecord.value}
                      note="Points receivers to your MTA-STS policy file. The id must change whenever the policy changes."
                      copied={copied}
                      onCopy={onCopy}
                      copyKey="mtasts-txt"
                      warnings={mtaSts.warnings}
                    />

                    {mtaSts.tlsReporting && (
                      <RecordCard
                        label="TLS-RPT"
                        type="TXT"
                        host={mtaSts.tlsReporting.host}
                        value={mtaSts.tlsReporting.value}
                        note={mtaSts.tlsReporting.note}
                        copied={copied}
                        onCopy={onCopy}
                        copyKey="tlsrpt"
                      />
                    )}

                    <div className={styles.policyFile}>
                      <div className={styles.policyFileHeader}>
                        <span className={styles.policyFileLabel}>Policy file</span>
                        <button
                          className={styles.recordCopy}
                          onClick={() =>
                            onCopy('mtasts-policy', mtaSts.policyFile.content)
                          }
                          aria-label="Copy MTA-STS policy file"
                        >
                          {copied['mtasts-policy'] ? (
                            <><CheckIcon size={13} /><span>Copied</span></>
                          ) : (
                            <><CopyIcon size={13} /><span>Copy</span></>
                          )}
                        </button>
                      </div>
                      <p className={styles.policyFileHint}>
                        Host this at <code>{mtaSts.policyFile.url}</code>
                      </p>
                      <pre className={styles.policyFileBody}>
                        <code>{mtaSts.policyFile.content}</code>
                      </pre>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </details>

      {/* Footer */}
      <div className={styles.resultActions}>
        <button className={styles.backBtn} onClick={onBack}>Edit Settings</button>
        <Link to="/domain" className={styles.verifyLink}>
          Verify with Domain Checker
          <ArrowRight />
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════ */

function LivePreview({ label, record, meta, tone = 'ok', warnings = [], sources }) {
  const toneClass =
    tone === 'error'
      ? styles.livePreviewError
      : tone === 'warning'
      ? styles.livePreviewWarning
      : '';
  return (
    <div className={`${styles.livePreview} ${toneClass}`.trim()}>
      <div className={styles.livePreviewHeader}>
        <span
          className={`${styles.livePreviewDot} ${
            tone === 'error'
              ? styles.livePreviewDotError
              : tone === 'warning'
              ? styles.livePreviewDotWarning
              : ''
          }`.trim()}
        />
        <span className={styles.livePreviewLabel}>{label}</span>
        <span className={styles.livePreviewCount}>{meta}</span>
      </div>
      <code className={styles.livePreviewCode}>{record}</code>
      {sources && sources.length > 0 && (
        <div className={styles.sourceList}>
          {sources.map((s, i) => (
            <div key={i} className={styles.sourceItem}>
              <span className={styles.sourceLabel}>{s.label}</span>
              <span className={styles.sourceMechanism}>{s.mechanism}</span>
              <span className={styles.sourceCost}>
                {s.lookupCost === 0 ? '0 lookups' : `${s.lookupCost} lookup${s.lookupCost !== 1 ? 's' : ''}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className={styles.warningList} role="alert">
          {warnings.map((w, i) => (
            <li key={i} className={`${styles.warning} ${styles[`warning-${w.level}`]}`}>
              <span className={styles.warningMessage}>{w.message}</span>
              {w.fix && <span className={styles.warningFix}>{w.fix}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpfSourceBreakdown({ sources, totalLookups, warnings }) {
  if (sources.length === 0) return null;
  return (
    <div className={styles.spfBreakdown}>
      <div className={styles.spfBreakdownHeader}>
        <span className={styles.spfBreakdownTitle}>Lookup breakdown</span>
        <span className={styles.spfBreakdownTotal}>{totalLookups} / 10</span>
      </div>
      <div className={styles.sourceList}>
        {sources.map((s, i) => (
          <div key={i} className={styles.sourceItem}>
            <span className={styles.sourceLabel}>{s.label}</span>
            <span className={styles.sourceMechanism}>{s.mechanism}</span>
            <span className={styles.sourceCost}>
              {s.lookupCost === 0 ? '0 lookups' : `${s.lookupCost} lookup${s.lookupCost !== 1 ? 's' : ''}`}
            </span>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <ul className={styles.warningList}>
          {warnings.map((w, i) => (
            <li key={i} className={`${styles.warning} ${styles[`warning-${w.level}`]}`}>
              <span className={styles.warningMessage}>{w.message}</span>
              {w.fix && <span className={styles.warningFix}>{w.fix}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HealthItem({ tone, label, detail }) {
  const dotClass =
    tone === 'error'
      ? styles.healthDotError
      : tone === 'warning'
      ? styles.healthDotWarning
      : styles.healthDotOk;
  return (
    <span className={styles.healthItem}>
      <span className={`${styles.healthDot} ${dotClass}`} aria-hidden="true" />
      <span className={styles.healthItemLabel}>{label}</span>
      <span className={styles.healthItemDetail}>{detail}</span>
    </span>
  );
}

function RecordCard({
  label,
  type,
  host,
  value,
  note,
  copied,
  onCopy,
  copyKey,
  statusBadge,
  warnings,
  extra,
}) {
  return (
    <div className={styles.recordCard}>
      <div className={styles.recordTop}>
        <div className={styles.recordBadges}>
          <span className={styles.recordLabel}>{label}</span>
          <span className={styles.recordType}>{type}</span>
          {statusBadge && (
            <span className={`${styles.statusBadge} ${styles[`statusBadge-${statusBadge.tone}`]}`}>
              {statusBadge.label}
            </span>
          )}
        </div>
        <button
          className={styles.recordCopy}
          onClick={() => onCopy(copyKey, value)}
          aria-label={`Copy ${label} record value`}
          aria-live="polite"
        >
          {copied[copyKey] ? (
            <><CheckIcon size={13} /><span>Copied</span></>
          ) : (
            <><CopyIcon size={13} /><span>Copy</span></>
          )}
        </button>
      </div>

      <div className={styles.recordFields}>
        <div className={styles.recordField}>
          <span className={styles.recordFieldLabel}>Host</span>
          <div className={styles.recordFieldValue}>
            <code>{host}</code>
            <button
              className={styles.fieldCopyBtn}
              onClick={() => onCopy(`${copyKey}-host`, host)}
              aria-label="Copy host"
            >
              {copied[`${copyKey}-host`] ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
            </button>
          </div>
        </div>
        <div className={styles.recordField}>
          <span className={styles.recordFieldLabel}>Value</span>
          <div className={styles.recordFieldValue}>
            <code>{value}</code>
            <button
              className={styles.fieldCopyBtn}
              onClick={() => onCopy(`${copyKey}-value`, value)}
              aria-label="Copy value"
            >
              {copied[`${copyKey}-value`] ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
            </button>
          </div>
        </div>
      </div>

      {note && <p className={styles.recordNote}>{note}</p>}

      {warnings && warnings.length > 0 && (
        <ul className={styles.warningList} role="alert">
          {warnings.map((w, i) => (
            <li key={i} className={`${styles.warning} ${styles[`warning-${w.level}`]}`}>
              <span className={styles.warningMessage}>{w.message}</span>
              {w.fix && <span className={styles.warningFix}>{w.fix}</span>}
            </li>
          ))}
        </ul>
      )}

      {extra}
    </div>
  );
}

/* ══════════════════════════════════════════════
   Inline icons
   ══════════════════════════════════════════════ */

function CheckMark() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12L10 17L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 4H20V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 14V19C19 19.55 18.55 20 18 20H5C4.45 20 4 19.55 4 19V6C4 5.45 4.45 5 5 5H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
