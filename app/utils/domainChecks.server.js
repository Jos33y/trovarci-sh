/* ═══════════════════════════════════════════════════════════════════════════
   domainChecks.server.js

   Orchestrates the full Domain Health Check. Runs all checks concurrently,
   returns the result shape the DomainChecker component already consumes.

   Session 1 + 2 coverage (real):
     Authentication: SPF, DKIM, DMARC, BIMI
     Mail Server:    MX records, SMTP connectivity + STARTTLS, Reverse DNS
     Reputation:     IP blacklists, Domain blacklists
     DNS Config:     Nameservers, SOA, DNSSEC, CAA
     Web & Security: SSL/TLS cert, HTTPS redirect, Security headers, Website

   Still pending (needs external API key):
     Reputation: Google Safe Browsing

   The remaining `pendingInfo` check returns status 'info' with a short,
   honest note rather than a fake pass.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  resolveTxt,
  resolveMx,
  resolveNs,
  resolveSoa,
  resolveCaa,
  resolve4,
  reverse,
  resolveGeneric,
  batchResolveTxt,
  findRecordStartingWith,
  network16,
  isLikelyDomain,
} from './dnsLookup.server.js';

import { checkIpBlacklists, checkDomainBlacklists } from './blacklistCheck.server.js';
import { probeSmtp } from './smtpProbe.server.js';
import { probeSsl } from './sslCheck.server.js';
import { probeHttpsRedirect, probeWebsite } from './httpProbe.server.js';
import { PROVIDERS, SENDING_SERVICES } from './dnsRecords.js';

/* ─── Known SPF include lookup costs ────────────────────────────────────
   Populated from the curated lists maintained in dnsRecords.js. When an SPF
   record uses a known include, we attribute its real lookup cost rather
   than counting 1 per include mechanism. Unknown includes still count as 1
   and the check caveats that the number may be an undercount. */

const KNOWN_INCLUDE_COSTS = (() => {
  const map = {};
  for (const p of PROVIDERS) {
    if (p.spfInclude) map[p.spfInclude.toLowerCase()] = p.spfLookupCost ?? 1;
  }
  for (const s of SENDING_SERVICES) {
    map[s.spfInclude.toLowerCase()] = s.spfLookupCost ?? 1;
  }
  return map;
})();

/* ─── DKIM selector list ─────────────────────────────────────────────────── */
/* Scanned in parallel against the target domain. If any resolves a valid
   DKIM record, DKIM is considered configured. Order does not matter. */

const DKIM_SELECTORS = [
  'google',
  'selector1',
  'selector2',
  'zmail',
  'fm1',
  'fm2',
  'fm3',
  'protonmail',
  'titan',
  'default',
  'k1',
  'k2',
  'mail',
  's1',
  'dkim',
];

/* ─── Provider fingerprints (MX-based) ───────────────────────────────────── */

const PROVIDER_FINGERPRINTS = [
  { pattern: /\bgoogle\.com$|aspmx\.l\.google\.com$/i, name: 'Google Workspace' },
  { pattern: /protection\.outlook\.com$/i, name: 'Microsoft 365' },
  { pattern: /zoho\.com$|zoho\.eu$|zoho\.in$/i, name: 'Zoho Mail' },
  { pattern: /messagingengine\.com$/i, name: 'Fastmail' },
  { pattern: /protonmail\.ch$|proton\.me$/i, name: 'Proton Mail' },
  { pattern: /titan\.email$/i, name: 'Titan Mail' },
  { pattern: /yahoodns\.net$/i, name: 'Yahoo' },
  { pattern: /icloud\.com$/i, name: 'iCloud Mail' },
  { pattern: /mimecast/i, name: 'Mimecast' },
  { pattern: /barracudanetworks/i, name: 'Barracuda' },
  { pattern: /mailgun\.org$|mxa\.mailgun\.org$/i, name: 'Mailgun' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   CHECK BUILDERS
   Each returns a check object: { name, status, title, detail, issues }.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── SPF ──────────────────────────────────────────────────────────────── */

function buildSpfCheck(domain, txtResult) {
  if (!txtResult.ok) {
    return {
      name: 'SPF',
      status: 'critical',
      title: 'SPF lookup failed',
      detail: `DNS error: ${txtResult.error}`,
      issues: [
        {
          severity: 'critical',
          title: 'Could not query SPF record',
          message: 'The TXT record lookup for this domain did not complete. Check that the domain exists and its nameservers are responding.',
          fix: null,
        },
      ],
    };
  }

  const spfRecord = findRecordStartingWith(txtResult.value, 'v=spf1');
  if (!spfRecord) {
    return {
      name: 'SPF',
      status: 'critical',
      title: 'No SPF record found',
      detail: `Checked TXT records at ${domain}`,
      issues: [
        {
          severity: 'critical',
          title: 'Domain has no SPF record',
          message: 'Without SPF, receiving servers cannot verify which hosts are authorised to send email for this domain. Gmail, Yahoo, and Microsoft deprioritise or reject unauthenticated mail.',
          fix: { type: 'tool', label: 'Generate SPF record', path: '/records' },
        },
      ],
    };
  }

  // Parse mechanisms and compute real lookup cost.
  const mechanisms = spfRecord.split(/\s+/).slice(1); // drop leading "v=spf1"
  const terminal = mechanisms.find((m) => /^[-~+?]all$/.test(m));

  let lookupCount = 0;
  let unknownIncludes = 0;
  const attributions = [];

  for (const m of mechanisms) {
    // include:domain.tld -> look up known cost
    const includeMatch = m.match(/^include:(.+)$/i);
    if (includeMatch) {
      const target = includeMatch[1].toLowerCase();
      const known = KNOWN_INCLUDE_COSTS[target];
      if (known !== undefined) {
        lookupCount += known;
        attributions.push(`${target} (${known})`);
      } else {
        lookupCount += 1;
        unknownIncludes += 1;
        attributions.push(`${target} (~1)`);
      }
      continue;
    }
    // redirect=domain.tld -> also costs at least 1 lookup
    if (/^redirect=/.test(m)) {
      lookupCount += 1;
      unknownIncludes += 1;
      continue;
    }
    // a, mx, a:host, mx:host, exists:, ptr all consume 1 lookup each
    if (/^(a|mx)$/i.test(m) || /^(a|mx|exists):/i.test(m) || /^ptr$/i.test(m)) {
      lookupCount += 1;
      continue;
    }
    // ip4:, ip6:, +all, ~all, -all, ?all consume no lookups
  }

  const issues = [];
  let status = 'pass';

  if (lookupCount > 10) {
    status = 'critical';
    issues.push({
      severity: 'critical',
      title: `SPF uses ${lookupCount} of 10 allowed DNS lookups`,
      message: 'RFC 7208 caps SPF at 10 DNS lookups. Over the limit, SPF evaluation returns PermError and the record fails entirely. Remove unused includes or consolidate sending services.',
      fix: { type: 'tool', label: 'Rebuild SPF record', path: '/records' },
    });
  } else if (lookupCount > 8) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `SPF uses ${lookupCount} of 10 lookups`,
      message: 'Close to the RFC 7208 limit. One more service with nested includes could push the record over the line.',
      fix: null,
    });
  }

  if (!terminal) {
    issues.push({
      severity: 'warning',
      title: 'SPF has no terminal mechanism',
      message: 'The record should end with ~all (soft fail) or -all (hard fail). Without a terminal, the default policy is neutral, which weakens SPF enforcement.',
      fix: null,
    });
    if (status === 'pass') status = 'warning';
  } else if (terminal === '+all') {
    issues.push({
      severity: 'critical',
      title: 'SPF terminal is +all',
      message: '+all authorises every host on the internet to send mail for this domain. This is a dangerous misconfiguration. Change it to ~all or -all.',
      fix: { type: 'tool', label: 'Fix SPF record', path: '/records' },
    });
    status = 'critical';
  }

  let detail = spfRecord;
  if (unknownIncludes > 0) {
    detail += ` (${unknownIncludes} unrecognised include${unknownIncludes !== 1 ? 's' : ''} estimated at 1 lookup each)`;
  }

  return {
    name: 'SPF',
    status,
    title: status === 'pass'
      ? `SPF record found, ${lookupCount} of 10 lookups`
      : `SPF record uses ${lookupCount} of 10 lookups`,
    detail,
    issues,
  };
}

/* ─── DKIM ─────────────────────────────────────────────────────────────── */

async function buildDkimCheck(domain) {
  const selectorNames = DKIM_SELECTORS.map((s) => `${s}._domainkey.${domain}`);
  const results = await batchResolveTxt(selectorNames, 4000);

  const foundSelectors = [];
  for (const [fqdn, res] of Object.entries(results)) {
    if (!res.ok) continue;
    const record = findRecordStartingWith(res.value, 'v=DKIM1');
    if (record) {
      foundSelectors.push({
        selector: fqdn.split('.')[0],
        fqdn,
      });
    }
  }

  if (foundSelectors.length === 0) {
    return {
      name: 'DKIM',
      status: 'warning',
      title: 'No DKIM record found for common selectors',
      detail: `Checked ${DKIM_SELECTORS.length} selectors including google, selector1, default, k1, zmail.`,
      issues: [
        {
          severity: 'warning',
          title: 'Emails are not cryptographically signed',
          message: 'Without DKIM, receiving servers cannot verify that messages claiming to be from this domain are genuine and unmodified. Enable DKIM in your email provider\'s admin console. This check scans common selector names; your provider may use a custom selector that was not detected.',
          fix: { type: 'tool', label: 'DKIM setup guide', path: '/records' },
        },
      ],
    };
  }

  return {
    name: 'DKIM',
    status: 'pass',
    title: `DKIM configured (${foundSelectors.length} selector${foundSelectors.length !== 1 ? 's' : ''})`,
    detail: `Active selectors: ${foundSelectors.map((s) => s.selector).join(', ')}`,
    issues: [],
  };
}

/* ─── DMARC ────────────────────────────────────────────────────────────── */

function buildDmarcCheck(domain, txtResult) {
  if (!txtResult.ok && !txtResult.isNoRecord) {
    return {
      name: 'DMARC',
      status: 'critical',
      title: 'DMARC lookup failed',
      detail: `DNS error on _dmarc.${domain}: ${txtResult.error}`,
      issues: [
        {
          severity: 'critical',
          title: 'Could not query DMARC record',
          message: 'The lookup at _dmarc.' + domain + ' did not complete. Retry the scan; if it persists, check that your DNS provider is responding.',
          fix: null,
        },
      ],
    };
  }

  if (!txtResult.ok || !txtResult.value) {
    return {
      name: 'DMARC',
      status: 'critical',
      title: 'No DMARC record found',
      detail: `Checked _dmarc.${domain}`,
      issues: [
        {
          severity: 'critical',
          title: 'Anyone can spoof this domain',
          message: 'Without a DMARC record, receiving servers have no instructions on how to handle email that fails SPF or DKIM. Spoofed mail may land in the inbox.',
          fix: { type: 'tool', label: 'Generate DMARC record', path: '/records' },
        },
      ],
    };
  }

  const record = findRecordStartingWith(txtResult.value, 'v=DMARC1');
  if (!record) {
    return {
      name: 'DMARC',
      status: 'critical',
      title: 'TXT records exist but no valid DMARC record',
      detail: `_dmarc.${domain} returned TXT values but none start with v=DMARC1.`,
      issues: [
        {
          severity: 'critical',
          title: 'DMARC record is malformed',
          message: 'The first DMARC tag must be v=DMARC1. Receiving servers will treat the record as invalid and fall back to no-policy behaviour.',
          fix: { type: 'tool', label: 'Rebuild DMARC record', path: '/records' },
        },
      ],
    };
  }

  // Parse policy tag
  const policyMatch = record.match(/\bp=(none|quarantine|reject)\b/i);
  const pctMatch = record.match(/\bpct=(\d+)\b/);
  const policy = policyMatch ? policyMatch[1].toLowerCase() : 'none';
  const pct = pctMatch ? parseInt(pctMatch[1], 10) : 100;

  const issues = [];
  let status = 'pass';

  if (policy === 'none' && pct === 100) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: 'DMARC is monitor-only',
      message: 'Policy is p=none, so nothing is quarantined or rejected. Spoofed email may still reach recipients. Review aggregate reports for 2-4 weeks, then move to p=quarantine with a low pct.',
      fix: { type: 'tool', label: 'Strengthen DMARC', path: '/records' },
    });
  } else if (policy === 'reject' && pct < 100) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `DMARC rejects only ${pct}% of failing mail`,
      message: 'The rest is treated as p=none. Increase pct gradually to 100 as you gain confidence that legitimate mail passes authentication.',
      fix: null,
    });
  }

  const titleParts = [`DMARC record found (p=${policy}`];
  if (pct < 100) titleParts.push(`pct=${pct}`);
  titleParts[titleParts.length - 1] += ')';

  return {
    name: 'DMARC',
    status,
    title: titleParts.join(', '),
    detail: record,
    issues,
  };
}

/* ─── BIMI ─────────────────────────────────────────────────────────────── */

function buildBimiCheck(domain, txtResult) {
  if (!txtResult.ok) {
    return {
      name: 'BIMI',
      status: 'info',
      title: 'BIMI not configured',
      detail: 'Optional. Displays your brand logo in supported email clients.',
      issues: [],
    };
  }

  const record = findRecordStartingWith(txtResult.value, 'v=BIMI1');
  if (!record) {
    return {
      name: 'BIMI',
      status: 'info',
      title: 'BIMI not configured',
      detail: 'Optional. Displays your brand logo in supported email clients.',
      issues: [],
    };
  }

  const hasLogo = /\bl=https:\/\//i.test(record);
  const hasVmc = /\ba=https:\/\//i.test(record);

  const issues = [];
  if (!hasLogo) {
    issues.push({
      severity: 'warning',
      title: 'BIMI record has no logo URL',
      message: 'A BIMI record without an l= tag cannot display a logo. Add the HTTPS URL of your SVG Tiny P/S logo file.',
      fix: { type: 'tool', label: 'Rebuild BIMI', path: '/records' },
    });
  }
  if (!hasVmc) {
    issues.push({
      severity: 'info',
      title: 'No Verified Mark Certificate referenced',
      message: 'Gmail and Yahoo require a VMC to display the logo in the inbox. Without one, the BIMI record is published but most inboxes will ignore it.',
      fix: null,
    });
  }

  return {
    name: 'BIMI',
    status: hasLogo ? (hasVmc ? 'pass' : 'info') : 'warning',
    title: hasLogo && hasVmc
      ? 'BIMI configured with VMC'
      : hasLogo
      ? 'BIMI configured, no VMC'
      : 'BIMI record incomplete',
    detail: record,
    issues,
  };
}

/* ─── MX ───────────────────────────────────────────────────────────────── */

function buildMxCheck(mxResult, detectedProvider) {
  if (!mxResult.ok) {
    if (mxResult.isNoRecord) {
      return {
        name: 'MX Records',
        status: 'critical',
        title: 'No MX records found',
        detail: 'This domain cannot receive email.',
        issues: [
          {
            severity: 'critical',
            title: 'Domain has no mail exchangers',
            message: 'Without MX records, no mail server knows where to deliver email addressed to this domain. If this domain is only used for sending (not receiving), this may be intentional; otherwise it is a critical misconfiguration.',
            fix: null,
          },
        ],
      };
    }
    return {
      name: 'MX Records',
      status: 'warning',
      title: 'MX lookup failed',
      detail: mxResult.error,
      issues: [],
    };
  }

  const sorted = mxResult.value;
  const summary = sorted
    .slice(0, 3)
    .map((r) => `${r.exchange} (pri ${r.priority})`)
    .join(', ');
  const extra = sorted.length > 3 ? `, +${sorted.length - 3} more` : '';

  return {
    name: 'MX Records',
    status: 'pass',
    title: detectedProvider
      ? `MX records configured. ${detectedProvider} detected`
      : `${sorted.length} MX record${sorted.length !== 1 ? 's' : ''} configured`,
    detail: summary + extra,
    issues: [],
  };
}

/* ─── Reverse DNS ──────────────────────────────────────────────────────── */

async function buildReverseDnsCheck(mxResult) {
  if (!mxResult.ok || mxResult.value.length === 0) {
    return {
      name: 'Reverse DNS',
      status: 'info',
      title: 'Reverse DNS not checked',
      detail: 'Needs at least one MX record to resolve.',
      issues: [],
    };
  }

  // Use the top-priority MX
  const topMx = mxResult.value[0];
  const aResult = await resolve4(topMx.exchange);
  if (!aResult.ok || aResult.value.length === 0) {
    return {
      name: 'Reverse DNS',
      status: 'info',
      title: 'Could not resolve MX host to IP',
      detail: `${topMx.exchange} did not return an A record. Reverse DNS check skipped.`,
      issues: [],
    };
  }

  const ip = aResult.value[0];
  const ptrResult = await reverse(ip);
  if (!ptrResult.ok) {
    return {
      name: 'Reverse DNS',
      status: 'warning',
      title: 'No PTR record for primary MX IP',
      detail: `${ip} has no reverse DNS. Receiving servers may flag or reject mail.`,
      issues: [
        {
          severity: 'warning',
          title: 'Missing PTR record on mail server IP',
          message: 'Many receivers require the sending mail server\'s IP to have a reverse DNS record that maps back to a forward-confirmed hostname. This is typically managed by the hosting provider or by your ISP; not by the domain owner.',
          fix: null,
        },
      ],
    };
  }

  return {
    name: 'Reverse DNS',
    status: 'pass',
    title: 'PTR record configured on primary MX IP',
    detail: `${ip} -> ${ptrResult.value[0]}`,
    issues: [],
  };
}

/* ─── Nameservers ──────────────────────────────────────────────────────── */

async function buildNameserversCheck(nsResult) {
  if (!nsResult.ok || nsResult.value.length === 0) {
    return {
      name: 'Nameservers',
      status: 'critical',
      title: 'No nameservers found',
      detail: 'Domain may be misconfigured or expired.',
      issues: [
        {
          severity: 'critical',
          title: 'Domain has no authoritative nameservers',
          message: 'NS records are missing or unresolvable. Without NS records, no DNS queries can be answered for this domain.',
          fix: null,
        },
      ],
    };
  }

  const nameservers = nsResult.value;
  const issues = [];
  let status = 'pass';

  if (nameservers.length < 2) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: 'Only one nameserver configured',
      message: 'Best practice is at least two nameservers on different networks. A single nameserver is a single point of failure.',
      fix: null,
    });
  }

  // Network diversity: resolve each NS's A record and compare /16 networks.
  // If the resolver is slow or upstream has trouble, resolution can fail
  // completely. In that case we honestly skip the diversity check rather
  // than claiming "0 networks."
  const aEntries = await Promise.all(
    nameservers.map(async (ns) => {
      const r = await resolve4(ns);
      return { ns, ips: r.ok ? r.value : [] };
    })
  );
  const resolvedAny = aEntries.some((e) => e.ips.length > 0);
  const networks = new Set();
  for (const entry of aEntries) {
    for (const ip of entry.ips) {
      const n = network16(ip);
      if (n) networks.add(n);
    }
  }

  if (resolvedAny && nameservers.length >= 2 && networks.size === 1) {
    if (status === 'pass') status = 'warning';
    issues.push({
      severity: 'warning',
      title: 'All nameservers on the same /16 network',
      message: 'If that network has an outage, DNS for your domain goes dark. Managed DNS providers like Cloudflare, Route 53, and NS1 spread nameservers across multiple networks.',
      fix: null,
    });
  }

  // Title honestly reflects what we actually know.
  let title;
  if (status === 'pass' && resolvedAny) {
    title = `${nameservers.length} nameservers on ${networks.size} network${networks.size !== 1 ? 's' : ''}`;
  } else if (!resolvedAny) {
    title = `${nameservers.length} nameserver${nameservers.length !== 1 ? 's' : ''} configured`;
  } else {
    title = `${nameservers.length} nameserver${nameservers.length !== 1 ? 's' : ''} configured`;
  }

  return {
    name: 'Nameservers',
    status,
    title,
    detail: nameservers.slice(0, 4).join(', ') + (nameservers.length > 4 ? ', ...' : ''),
    issues,
  };
}

/* ─── SOA ──────────────────────────────────────────────────────────────── */

function buildSoaCheck(soaResult) {
  if (!soaResult.ok) {
    return {
      name: 'SOA Record',
      status: 'warning',
      title: 'SOA lookup failed',
      detail: soaResult.error,
      issues: [],
    };
  }
  const soa = soaResult.value;
  return {
    name: 'SOA Record',
    status: 'pass',
    title: 'SOA record properly configured',
    detail: `Serial: ${soa.serial}, Refresh: ${soa.refresh}s, Retry: ${soa.retry}s`,
    issues: [],
  };
}

/* ─── DNSSEC ───────────────────────────────────────────────────────────── */

async function buildDnssecCheck(domain) {
  // Attempt DNSKEY at the zone. A successful resolution with records means
  // the zone is DNSSEC-signed. If the underlying c-ares does not support
  // DNSKEY we fall back to an info result rather than a false negative.
  const res = await resolveGeneric(domain, 'DNSKEY', 3000);
  if (res.ok && Array.isArray(res.value) && res.value.length > 0) {
    return {
      name: 'DNSSEC',
      status: 'pass',
      title: `DNSSEC configured (${res.value.length} DNSKEY record${res.value.length !== 1 ? 's' : ''})`,
      detail: 'Zone is cryptographically signed. Resolvers can verify the integrity of DNS responses.',
      issues: [],
    };
  }
  if (res.code === 'EBADRESP' || res.code === 'ENOTIMP' || res.code === 'EUNKNOWN') {
    return {
      name: 'DNSSEC',
      status: 'info',
      title: 'DNSSEC status could not be determined',
      detail: 'This runtime does not support DNSKEY queries directly. A DNSSEC-aware resolver is needed for an authoritative check.',
      issues: [],
    };
  }
  return {
    name: 'DNSSEC',
    status: 'info',
    title: 'DNSSEC not configured',
    detail: 'Optional security enhancement. Protects against DNS spoofing by signing the zone cryptographically.',
    issues: [],
  };
}

/* ─── CAA ──────────────────────────────────────────────────────────────── */

function buildCaaCheck(caaResult) {
  if (!caaResult.ok) {
    return {
      name: 'CAA Record',
      status: 'info',
      title: 'No CAA record',
      detail: 'Optional. Restricts which certificate authorities can issue SSL certificates for this domain.',
      issues: [],
    };
  }
  const records = caaResult.value;
  if (!records || records.length === 0) {
    return {
      name: 'CAA Record',
      status: 'info',
      title: 'No CAA record',
      detail: 'Optional. Restricts which certificate authorities can issue SSL certificates for this domain.',
      issues: [],
    };
  }
  const issuers = records
    .map((r) => r.issue || r.issuewild)
    .filter(Boolean);
  return {
    name: 'CAA Record',
    status: 'pass',
    title: `CAA record configured (${records.length} entr${records.length !== 1 ? 'ies' : 'y'})`,
    detail: issuers.length > 0 ? `Authorised CAs: ${issuers.join(', ')}` : `${records.length} CAA record(s) present`,
    issues: [],
  };
}

/* ─── Blacklist checks ─────────────────────────────────────────────────── */

async function buildIpBlacklistCheck(mxResult) {
  if (!mxResult.ok || mxResult.value.length === 0) {
    return {
      name: 'IP Blacklists',
      status: 'info',
      title: 'No MX to check',
      detail: 'IP blacklist check skipped because no mail exchanger was found.',
      issues: [],
    };
  }

  const topMx = mxResult.value[0];
  const aResult = await resolve4(topMx.exchange);
  if (!aResult.ok || aResult.value.length === 0) {
    return {
      name: 'IP Blacklists',
      status: 'info',
      title: 'Could not resolve MX to IP',
      detail: `${topMx.exchange} did not return an A record. Blacklist check skipped.`,
      issues: [],
    };
  }

  const ip = aResult.value[0];
  const result = await checkIpBlacklists(ip);

  if (result.totalListed === 0) {
    return {
      name: 'IP Blacklists',
      status: 'pass',
      title: `Not listed on any of ${result.totalChecked} IP blacklists`,
      detail: `Checked ${ip} against Spamhaus ZEN, SpamCop, SORBS, PSBL, Barracuda${result.totalErrors > 0 ? ` (${result.totalErrors} zone${result.totalErrors !== 1 ? 's' : ''} errored)` : ''}.`,
      issues: [],
    };
  }

  const issues = result.listedOn.map((hit) => ({
    severity: 'critical',
    title: `Listed on ${hit.zone.name}`,
    message: `${ip} is listed on ${hit.zone.name} (${hit.zone.zone}). ${hit.zone.notes} Mail sent from this IP may be rejected or filtered by receivers that consult this list.`,
    fix: { type: 'external', label: `Check ${hit.zone.name} lookup`, url: hit.zone.delistUrl },
  }));

  return {
    name: 'IP Blacklists',
    status: 'critical',
    title: `Listed on ${result.totalListed} of ${result.totalChecked} blacklists`,
    detail: `${ip} appears on: ${result.listedOn.map((h) => h.zone.name).join(', ')}`,
    issues,
  };
}

async function buildDomainBlacklistCheck(domain) {
  const result = await checkDomainBlacklists(domain);

  if (result.totalListed === 0) {
    return {
      name: 'Domain Blacklists',
      status: 'pass',
      title: 'Not listed on domain blacklists',
      detail: `Checked ${result.totalChecked} zones including Spamhaus DBL and SURBL${result.totalErrors > 0 ? ` (${result.totalErrors} errored)` : ''}.`,
      issues: [],
    };
  }

  const issues = result.listedOn.map((hit) => ({
    severity: 'critical',
    title: `Listed on ${hit.zone.name}`,
    message: `${domain} is listed on ${hit.zone.name}. ${hit.zone.notes}`,
    fix: { type: 'external', label: `${hit.zone.name} lookup`, url: hit.zone.delistUrl },
  }));

  return {
    name: 'Domain Blacklists',
    status: 'critical',
    title: `Listed on ${result.totalListed} of ${result.totalChecked} domain blacklists`,
    detail: `Appears on: ${result.listedOn.map((h) => h.zone.name).join(', ')}`,
    issues,
  };
}

/* ─── SMTP Connectivity ────────────────────────────────────────────────── */

async function buildSmtpConnectivityCheck(mxResult) {
  if (!mxResult.ok || mxResult.value.length === 0) {
    return {
      name: 'SMTP Connectivity',
      status: 'info',
      title: 'No MX to probe',
      detail: 'SMTP check skipped because no mail exchanger was found.',
      issues: [],
    };
  }

  const topMx = mxResult.value[0];
  const probe = await probeSmtp(topMx.exchange, 25);

  if (!probe.ok) {
    // Timeout = almost certainly port 25 blocked on the scanner's own
    // outbound. Most residential ISPs, Hetzner, DigitalOcean, and many
    // other hosts block outbound 25 to prevent spam. This is not a
    // signal that the remote MX is broken.
    const isTimeout = /timed out|ETIMEDOUT|ETIMEOUT/i.test(probe.error || '');
    if (isTimeout) {
      return {
        name: 'SMTP Connectivity',
        status: 'info',
        title: 'SMTP probe could not reach the mail server',
        detail: `${topMx.exchange}:25 did not respond. The scanner may be blocked from outbound port 25.`,
        issues: [
          {
            severity: 'info',
            title: 'Port 25 probe timed out',
            message: 'Most residential ISPs and cloud providers block outbound port 25 to prevent spam. The probe timed out, which usually means the scanner itself cannot reach the server, not that the server is broken. Real mail delivery from other providers is almost certainly unaffected.',
            fix: null,
          },
        ],
      };
    }
    // Non-timeout failures (connection refused, DNS error, protocol error)
    // are more likely to reflect a real remote problem.
    return {
      name: 'SMTP Connectivity',
      status: 'warning',
      title: 'SMTP handshake failed',
      detail: `${topMx.exchange}:25 - ${probe.error}`,
      issues: [
        {
          severity: 'warning',
          title: 'Mail server refused or closed the connection',
          message: 'The server is reachable but did not complete a clean SMTP exchange. Could indicate greylisting of unknown clients, a misconfigured listener, or a temporary outage. Retry the scan in a few minutes.',
          fix: null,
        },
      ],
    };
  }

  const issues = [];
  let status = 'pass';

  if (!probe.supportsStarttls) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: 'Server does not advertise STARTTLS',
      message:
        'Without STARTTLS, mail between servers travels in plaintext and can be intercepted. Modern receivers may deprioritise or refuse plaintext delivery from senders. Contact your mail provider to enable STARTTLS.',
      fix: null,
    });
  } else if (probe.tlsVersion && /TLSv1(\.0|\.1)?$/i.test(probe.tlsVersion)) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Outdated TLS version: ${probe.tlsVersion}`,
      message:
        'TLS 1.0 and 1.1 are deprecated and considered insecure. Mail delivery may be rejected by modern receivers. Upgrade the mail server to support TLS 1.2 or 1.3.',
      fix: null,
    });
  }

  const titleParts = [`SMTP responding, ${probe.connectTimeMs}ms connect`];
  if (probe.tlsVersion) titleParts.push(`${probe.tlsVersion} supported`);
  else if (probe.supportsStarttls) titleParts.push('STARTTLS advertised');

  return {
    name: 'SMTP Connectivity',
    status,
    title: titleParts.join(', '),
    detail: `${topMx.exchange}:25${probe.tlsCipher ? ` via ${probe.tlsCipher}` : ''}`,
    issues,
  };
}

/* ─── SSL / TLS Certificate ────────────────────────────────────────────── */

async function buildSslCheck(domain) {
  const probe = await probeSsl(domain);

  if (!probe.ok) {
    return {
      name: 'SSL/TLS',
      status: 'warning',
      title: 'Could not retrieve SSL certificate',
      detail: `${domain}:443 - ${probe.error}`,
      issues: [
        {
          severity: 'warning',
          title: 'No HTTPS response on port 443',
          message:
            'Either the domain has no web server configured or port 443 is blocked. If this domain is only used for email, HTTPS is optional; if it hosts a website, receivers may view the lack of HTTPS as a trust signal.',
          fix: null,
        },
      ],
    };
  }

  const issues = [];
  let status = 'pass';
  const { cert, daysUntilExpiry, isExpired, matchesHostname, tlsVersion } = probe;

  if (isExpired) {
    status = 'critical';
    issues.push({
      severity: 'critical',
      title: 'SSL certificate is expired',
      message: `The certificate expired ${Math.abs(daysUntilExpiry)} days ago. Browsers and email clients will show warnings. Renew it immediately.`,
      fix: null,
    });
  } else if (daysUntilExpiry !== null && daysUntilExpiry < 14) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Certificate expires in ${daysUntilExpiry} days`,
      message:
        'Set up automatic renewal or renew manually before expiry. Let\'s Encrypt certificates are free and support automation.',
      fix: null,
    });
  }

  if (!matchesHostname) {
    status = 'critical';
    issues.push({
      severity: 'critical',
      title: 'Certificate does not cover this hostname',
      message: `The certificate is issued for ${cert.subjectCn || 'a different domain'}, not ${domain}. Browsers will reject the connection as a trust error. Reissue the certificate with ${domain} in the Subject Alternative Names.`,
      fix: null,
    });
  }

  if (tlsVersion && /TLSv1(\.0|\.1)?$/i.test(tlsVersion)) {
    if (status === 'pass') status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Outdated TLS version: ${tlsVersion}`,
      message: 'TLS 1.0 and 1.1 are deprecated. Upgrade the web server to TLS 1.2 or 1.3.',
      fix: null,
    });
  }

  const expiryText = isExpired
    ? 'expired'
    : daysUntilExpiry !== null
    ? `expires in ${daysUntilExpiry} days`
    : 'expiry unknown';
  const issuerText = cert.issuerCn || 'unknown issuer';

  return {
    name: 'SSL/TLS',
    status,
    title: status === 'pass'
      ? `Valid SSL certificate, ${expiryText}`
      : 'SSL certificate has issues',
    detail: `${issuerText}, ${tlsVersion || 'TLS version unknown'}, ${expiryText}`,
    issues,
  };
}

/* ─── HTTPS Redirect ───────────────────────────────────────────────────── */

async function buildHttpsRedirectCheck(domain) {
  const probe = await probeHttpsRedirect(domain);

  if (!probe.ok) {
    return {
      name: 'HTTPS Redirect',
      status: 'info',
      title: 'HTTP port not reachable',
      detail: probe.error || 'No response on port 80.',
      issues: [],
    };
  }

  if (!probe.redirectsToHttps) {
    return {
      name: 'HTTPS Redirect',
      status: 'warning',
      title: 'HTTP does not redirect to HTTPS',
      detail: `Final URL: ${probe.finalUrl}`,
      issues: [
        {
          severity: 'warning',
          title: 'Visitors can reach the site over plain HTTP',
          message:
            'Configure a 301 redirect from http://' + domain + ' to https://' + domain + ' so every request is upgraded to HTTPS. This also strengthens HSTS enforcement.',
          fix: null,
        },
      ],
    };
  }

  const firstHop = probe.firstHopStatus;
  const isPermanent = firstHop === 301 || firstHop === 308;

  return {
    name: 'HTTPS Redirect',
    status: 'pass',
    title: isPermanent
      ? `HTTP redirects to HTTPS (${firstHop})`
      : `HTTP redirects to HTTPS (${firstHop || 'non-permanent'})`,
    detail: `Final URL: ${probe.finalUrl}`,
    issues: [],
  };
}

/* ─── Security Headers ─────────────────────────────────────────────────── */

function buildSecurityHeadersCheck(websiteProbe) {
  if (!websiteProbe || !websiteProbe.ok) {
    return {
      name: 'Security Headers',
      status: 'info',
      title: 'Headers not analysed',
      detail: 'Website probe failed; security header analysis skipped.',
      issues: [],
    };
  }

  const sh = websiteProbe.securityHeaders;
  const present = sh.criticalPresent;
  const missing = [];
  if (!sh.hsts.present) missing.push('Strict-Transport-Security');
  if (!sh.xcto.present) missing.push('X-Content-Type-Options');
  if (!sh.xfo.present && !sh.cspFrameAncestors) missing.push('X-Frame-Options or CSP frame-ancestors');

  const issues = [];
  let status = 'pass';

  if (present < sh.criticalTotal) {
    status = present <= 1 ? 'warning' : 'info';
    issues.push({
      severity: status,
      title: `${missing.length} security header${missing.length !== 1 ? 's' : ''} missing`,
      message: `Missing: ${missing.join(', ')}. These headers protect against common web attacks and signal a well-maintained domain to email receivers. Configure them at the web server or CDN layer.`,
      fix: null,
    });
  }

  const summaryParts = [];
  summaryParts.push(`HSTS: ${sh.hsts.present ? 'yes' : 'no'}`);
  summaryParts.push(`X-Content-Type-Options: ${sh.xcto.present ? 'yes' : 'no'}`);
  summaryParts.push(`Framing protection: ${sh.xfo.present || sh.cspFrameAncestors ? 'yes' : 'no'}`);
  if (sh.csp.present) summaryParts.push('CSP: yes');
  if (sh.referrerPolicy.present) summaryParts.push('Referrer-Policy: yes');

  return {
    name: 'Security Headers',
    status,
    title: `${present} of ${sh.criticalTotal} critical headers present`,
    detail: summaryParts.join(', '),
    issues,
  };
}

/* ─── Website ──────────────────────────────────────────────────────────── */

function buildWebsiteCheck(websiteProbe) {
  if (!websiteProbe || !websiteProbe.ok) {
    return {
      name: 'Website',
      status: 'info',
      title: 'No HTTPS website responding',
      detail: websiteProbe?.error || 'Could not reach the site.',
      issues: [],
    };
  }

  const { status, responseTimeMs } = websiteProbe;
  const issues = [];
  let checkStatus = 'pass';

  if (status >= 500) {
    checkStatus = 'critical';
    issues.push({
      severity: 'critical',
      title: `Server returned HTTP ${status}`,
      message: 'The web server is responding but with a server-side error. This may affect how email clients and recipients perceive the domain.',
      fix: null,
    });
  } else if (status >= 400) {
    checkStatus = 'warning';
    issues.push({
      severity: 'warning',
      title: `Server returned HTTP ${status}`,
      message: 'The homepage returns a client error. If the domain is intentionally unused for web, this is not critical; if it should have a site, check server routing.',
      fix: null,
    });
  } else if (responseTimeMs > 3000) {
    checkStatus = 'warning';
    issues.push({
      severity: 'warning',
      title: `Slow response time: ${responseTimeMs}ms`,
      message: 'Responses over 3 seconds can signal instability to email receivers that crawl sender websites. Check server performance and CDN configuration.',
      fix: null,
    });
  }

  return {
    name: 'Website',
    status: checkStatus,
    title: `Site responding, HTTP ${status}, ${responseTimeMs}ms`,
    detail: `GET https://${websiteProbe.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}/`,
    issues,
  };
}

/* ─── Pending (Session 2) stubs ────────────────────────────────────────── */

function pendingInfo(name, reason) {
  return {
    name,
    status: 'info',
    title: 'Check pending',
    detail: reason,
    issues: [],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ORCHESTRATOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Detect the email provider from MX records.
 */
function detectProviderFromMx(mxRecords) {
  if (!Array.isArray(mxRecords) || mxRecords.length === 0) return null;
  for (const rec of mxRecords) {
    for (const fp of PROVIDER_FINGERPRINTS) {
      if (fp.pattern.test(rec.exchange)) return fp.name;
    }
  }
  return null;
}

/**
 * Compute a category's overall status from its check statuses.
 * Never worse than 'healthy' unless a check is warning/critical. Info-only
 * categories stay healthy.
 */
function rollupCategoryStatus(checks) {
  if (checks.some((c) => c.status === 'critical')) return 'critical';
  if (checks.some((c) => c.status === 'warning')) return 'issues';
  return 'healthy';
}

/**
 * Compute the overall domain status from category statuses.
 */
function rollupOverallStatus(categories) {
  if (categories.some((c) => c.status === 'critical')) return 'critical';
  if (categories.some((c) => c.status === 'issues')) return 'issues';
  return 'healthy';
}

/**
 * Run the full domain health check.
 *
 * @param {string} rawDomain - user-supplied domain (pre-validation OK; we re-validate)
 * @returns {Promise<{ok: boolean, result?: object, error?: string}>}
 */
export async function runDomainCheck(rawDomain) {
  const domain = (rawDomain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');

  if (!isLikelyDomain(domain)) {
    return { ok: false, error: 'Invalid domain format' };
  }

  // Fire every synchronous-initiable lookup in parallel. Each lookup has
  // its own timeout, so the total scan time is bounded by the slowest
  // single query (~5s by default). The network probes (SMTP, SSL, HTTP)
  // run alongside DNS so total scan time stays in the 4-7s band.
  const [
    apexTxt,
    dmarcTxt,
    bimiTxt,
    mxResult,
    nsResult,
    soaResult,
    caaResult,
    sslCheckPromise,
    httpsRedirectCheckPromise,
    websiteProbePromise,
  ] = await Promise.all([
    resolveTxt(domain),
    resolveTxt(`_dmarc.${domain}`),
    resolveTxt(`default._bimi.${domain}`),
    resolveMx(domain),
    resolveNs(domain),
    resolveSoa(domain),
    resolveCaa(domain),
    buildSslCheck(domain),
    buildHttpsRedirectCheck(domain),
    probeWebsite(domain),
  ]);

  // Dependent + async checks that need prior results, or their own batching.
  // SMTP connectivity depends on MX so it runs in this second wave.
  const [
    dkimCheck,
    reverseDnsCheck,
    nameserversCheck,
    dnssecCheck,
    ipBlacklistCheck,
    domainBlacklistCheck,
    smtpConnectivityCheck,
  ] = await Promise.all([
    buildDkimCheck(domain),
    buildReverseDnsCheck(mxResult),
    buildNameserversCheck(nsResult),
    buildDnssecCheck(domain),
    buildIpBlacklistCheck(mxResult),
    buildDomainBlacklistCheck(domain),
    buildSmtpConnectivityCheck(mxResult),
  ]);

  const detectedProvider = detectProviderFromMx(mxResult.ok ? mxResult.value : []);

  const categories = [
    {
      id: 'authentication',
      label: 'Email Authentication',
      icon: 'shield',
      checks: [
        buildSpfCheck(domain, apexTxt),
        dkimCheck,
        buildDmarcCheck(domain, dmarcTxt),
        buildBimiCheck(domain, bimiTxt),
      ],
    },
    {
      id: 'mailServer',
      label: 'Mail Server',
      icon: 'server',
      checks: [
        buildMxCheck(mxResult, detectedProvider),
        smtpConnectivityCheck,
        reverseDnsCheck,
      ],
    },
    {
      id: 'reputation',
      label: 'Domain Reputation',
      icon: 'reputation',
      checks: [
        ipBlacklistCheck,
        domainBlacklistCheck,
        pendingInfo(
          'Google Safe Browsing',
          'Safe Browsing check requires a Google API key. Will be enabled once credentials are configured.'
        ),
      ],
    },
    {
      id: 'webSecurity',
      label: 'Web & Security',
      icon: 'lock',
      checks: [
        sslCheckPromise,
        httpsRedirectCheckPromise,
        buildSecurityHeadersCheck(websiteProbePromise),
        buildWebsiteCheck(websiteProbePromise),
      ],
    },
    {
      id: 'dnsConfig',
      label: 'DNS Configuration',
      icon: 'dns',
      checks: [
        nameserversCheck,
        buildSoaCheck(soaResult),
        dnssecCheck,
        buildCaaCheck(caaResult),
      ],
    },
  ].map((cat) => ({ ...cat, status: rollupCategoryStatus(cat.checks) }));

  const overall = rollupOverallStatus(categories);

  return {
    ok: true,
    result: {
      domain,
      scannedAt: new Date().toISOString(),
      overall,
      detectedProvider,
      categories,
    },
  };
}
