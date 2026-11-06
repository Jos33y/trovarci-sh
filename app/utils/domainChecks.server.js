// Domain Health Check: runs every check concurrently and returns the shape DomainChecker renders.

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

import { checkIpBlacklists, checkDomainBlacklists, IP_BLACKLISTS } from './blacklistCheck.server.js';
import { probeSmtp } from './smtpProbe.server.js';
import { probeSsl } from './sslCheck.server.js';
import { probeHttpsRedirect, probeWebsite } from './httpProbe.server.js';
import { PROVIDERS, SENDING_SERVICES } from './dnsRecords.js';

// Real lookup cost of known SPF includes; unknown includes count as 1.

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

// DKIM selector list
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

// Provider fingerprints (MX-based)

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

// Check builders. Each returns { name, status, title, detail, issues }.

// SPF

function buildSpfCheck(domain, txtResult) {
  if (!txtResult.ok) {
    return {
      name: 'SPF (allowed senders)',
      status: 'critical',
      title: 'Couldn’t read the record',
      detail: `DNS error: ${txtResult.error}`,
      issues: [
        {
          severity: 'critical',
          title: 'We couldn’t read your SPF record',
          message: 'We couldn’t read this domain’s records. Check the domain is spelled right and still registered, then try again.',
          fix: null,
        },
      ],
    };
  }

  const spfRecord = findRecordStartingWith(txtResult.value, 'v=spf1');
  if (!spfRecord) {
    return {
      name: 'SPF (allowed senders)',
      status: 'critical',
      title: 'Missing',
      detail: `Checked TXT records at ${domain}`,
      issues: [
        {
          severity: 'critical',
          title: 'Your domain doesn’t say who may send its email',
          message: 'Nothing says which services may send email for your domain, so Gmail, Yahoo and Microsoft trust it less and may refuse it. Add an SPF record: the DNS Generator writes it for your provider.',
          fix: { type: 'tool', label: 'Generate SPF record', path: '/records' },
        },
      ],
    };
  }

  // Parse mechanisms and compute real lookup cost.
  const mechanisms = spfRecord.split(/\s+/).slice(1); // drop leading "v=spf1"
  // A bare "all" means "+all" (RFC 7208 4.6.2).
  const allMech = mechanisms.find((m) => /^[-~+?]?all$/i.test(m));
  const terminal = allMech ? (/^[-~+?]/.test(allMech) ? allMech.toLowerCase() : '+all') : null;
  // With no "all", redirect= hands the whole policy to another record (RFC 7208 6.1).
  const redirectTarget = allMech ? null : (mechanisms.find((m) => /^redirect=/i.test(m)) || '').slice(9).toLowerCase() || null;

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
    const redirectMatch = m.match(/^redirect=(.+)$/i);
    if (redirectMatch) {
      if (allMech) continue; // ignored when the record has an "all"
      const known = KNOWN_INCLUDE_COSTS[redirectMatch[1].toLowerCase()];
      if (known !== undefined) {
        lookupCount += known;
      } else {
        lookupCount += 1;
        unknownIncludes += 1;
      }
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
      title: `Too many lookups: ${lookupCount} of 10`,
      message: 'Your SPF record names too many services. Past 10 lookups, SPF stops working completely, even though the record looks fine. Remove services you no longer use.',
      fix: { type: 'tool', label: 'Rebuild SPF record', path: '/records' },
    });
  } else if (lookupCount > 8) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Close to the limit: ${lookupCount} of 10 lookups`,
      message: 'Your SPF record is close to the 10-lookup limit. One more service could break it.',
      fix: null,
    });
  }

  if (!terminal && !redirectTarget) {
    issues.push({
      severity: 'warning',
      title: 'Doesn’t end with ~all or -all',
      message: 'Your SPF record should end with ~all or -all. Without it, the record doesn’t say what to do with other senders, which weakens it.',
      fix: null,
    });
    if (status === 'pass') status = 'warning';
  } else if (terminal === '+all') {
    issues.push({
      severity: 'critical',
      title: 'Lets anyone send as you (+all)',
      message: '+all lets anyone in the world send email as your domain. Change it to ~all or -all now.',
      fix: { type: 'tool', label: 'Fix SPF record', path: '/records' },
    });
    status = 'critical';
  }

  let detail = spfRecord;
  if (redirectTarget) detail += ` (policy set by ${redirectTarget})`;
  if (unknownIncludes > 0) {
    detail += ` (${unknownIncludes} unrecognised include${unknownIncludes !== 1 ? 's' : ''} estimated at 1 lookup each)`;
  }

  return {
    name: 'SPF (allowed senders)',
    status,
    title: status === 'pass'
      ? `Set up, ${lookupCount} of 10 lookups used`
      : `SPF record uses ${lookupCount} of 10 lookups`,
    detail,
    issues,
  };
}

// DKIM

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
      name: 'DKIM (email signature)',
      status: 'warning',
      title: 'Not found',
      detail: `Checked ${DKIM_SELECTORS.length} selectors including google, selector1, default, k1, zmail.`,
      issues: [
        {
          severity: 'warning',
          title: 'Your emails aren’t signed',
          message: 'Your emails aren’t signed, so providers can’t prove they came from you and weren’t changed. Turn on DKIM in your email provider’s settings, then add the record it gives you. Already did? Your provider may use a name this check doesn’t try: send yourself an email in Gmail, choose Show original and look for DKIM: PASS.',
          fix: { type: 'tool', label: 'Set up DKIM', path: '/records' },
        },
      ],
    };
  }

  return {
    name: 'DKIM (email signature)',
    status: 'pass',
    title: `Set up (${foundSelectors.length} key${foundSelectors.length !== 1 ? 's' : ''} found)`,
    detail: `Active selectors: ${foundSelectors.map((s) => s.selector).join(', ')}`,
    issues: [],
  };
}

// DMARC

function buildDmarcCheck(domain, txtResult) {
  if (!txtResult.ok && !txtResult.isNoRecord) {
    return {
      name: 'DMARC (fake-email protection)',
      status: 'critical',
      title: 'Couldn’t read the record',
      detail: `DNS error on _dmarc.${domain}: ${txtResult.error}`,
      issues: [
        {
          severity: 'critical',
          title: 'We couldn’t read your DMARC record',
          message: 'We couldn’t read your DMARC record. Try again in a minute; if it keeps happening, check your DNS provider is working.',
          fix: null,
        },
      ],
    };
  }

  if (!txtResult.ok || !txtResult.value) {
    return {
      name: 'DMARC (fake-email protection)',
      status: 'critical',
      title: 'Missing',
      detail: `Checked _dmarc.${domain}`,
      issues: [
        {
          severity: 'critical',
          title: 'Anyone can send email pretending to be you',
          message: 'Nothing tells mail providers what to do with email pretending to be from you, so fakes can reach inboxes. Add a DMARC record: the DNS Generator writes it.',
          fix: { type: 'tool', label: 'Generate DMARC record', path: '/records' },
        },
      ],
    };
  }

  const record = findRecordStartingWith(txtResult.value, 'v=DMARC1');
  if (!record) {
    return {
      name: 'DMARC (fake-email protection)',
      status: 'critical',
      title: 'A record is there, but it isn’t valid',
      detail: `_dmarc.${domain} returned TXT values but none start with v=DMARC1.`,
      issues: [
        {
          severity: 'critical',
          title: 'Your DMARC record is written wrong',
          message: 'Your DMARC record must start with v=DMARC1. Until it does, mail providers ignore it.',
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
      title: 'Watching only (p=none)',
      message: 'Your DMARC is set to p=none, so fake email pretending to be you isn’t stopped yet. Once your own email has passed for 2 to 4 weeks, change it to p=quarantine.',
      fix: { type: 'tool', label: 'Strengthen DMARC', path: '/records' },
    });
  } else if (policy === 'reject' && pct < 100) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Applies to only ${pct}% of failing email`,
      message: 'Only part of failing email gets this policy; the rest is let through. Raise pct to 100 step by step once your own email passes.',
      fix: null,
    });
  }

  const titleParts = [`Set up (p=${policy}`];
  if (pct < 100) titleParts.push(`pct=${pct}`);
  titleParts[titleParts.length - 1] += ')';

  return {
    name: 'DMARC (fake-email protection)',
    status,
    title: titleParts.join(', '),
    detail: record,
    issues,
  };
}

// BIMI

function buildBimiCheck(domain, txtResult) {
  if (!txtResult.ok) {
    return {
      name: 'BIMI (logo in inbox)',
      status: 'info',
      title: 'Not set up (optional)',
      detail: 'Optional. Displays your brand logo in supported email clients.',
      issues: [],
    };
  }

  const record = findRecordStartingWith(txtResult.value, 'v=BIMI1');
  if (!record) {
    return {
      name: 'BIMI (logo in inbox)',
      status: 'info',
      title: 'Not set up (optional)',
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
      title: 'No logo link',
      message: 'Your BIMI record has no logo link (l=). Add the web address of your logo file.',
      fix: { type: 'tool', label: 'Rebuild BIMI', path: '/records' },
    });
  }
  if (!hasVmc) {
    issues.push({
      severity: 'info',
      title: 'No mark certificate (VMC)',
      message: 'Gmail and Yahoo only show your logo with a paid mark certificate (VMC). Without one, most inboxes ignore BIMI.',
      fix: null,
    });
  }

  return {
    name: 'BIMI (logo in inbox)',
    status: hasLogo ? (hasVmc ? 'pass' : 'info') : 'warning',
    title: hasLogo && hasVmc
      ? 'Set up, with a mark certificate'
      : hasLogo
      ? 'Set up, without a mark certificate'
      : 'BIMI record incomplete',
    detail: record,
    issues,
  };
}

// MX

function buildMxCheck(mxResult, detectedProvider) {
  if (!mxResult.ok) {
    if (mxResult.isNoRecord) {
      return {
        name: 'Mail servers (MX)',
        status: 'critical',
        title: 'No mail servers',
        detail: 'This domain cannot receive email.',
        issues: [
          {
            severity: 'critical',
            title: 'Email sent to this domain has nowhere to go',
            message: 'Email sent to this domain has nowhere to go. If the domain only sends email, that’s fine; otherwise add the MX records your email provider gives you.',
            fix: null,
          },
        ],
      };
    }
    return {
      name: 'Mail servers (MX)',
      status: 'warning',
      title: 'Couldn’t look up your mail servers',
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
    name: 'Mail servers (MX)',
    status: 'pass',
    title: detectedProvider
      ? `Set up, using ${detectedProvider}`
      : `${sorted.length} mail server${sorted.length !== 1 ? 's' : ''} set up`,
    detail: summary + extra,
    issues: [],
  };
}

// Reverse DNS

async function buildReverseDnsCheck(mxResult) {
  if (!mxResult.ok || mxResult.value.length === 0) {
    return {
      name: 'Server name (reverse DNS)',
      status: 'info',
      title: 'Not checked',
      detail: 'Needs at least one MX record to resolve.',
      issues: [],
    };
  }

  // Use the top-priority MX
  const topMx = mxResult.value[0];
  const aResult = await resolve4(topMx.exchange);
  if (!aResult.ok || aResult.value.length === 0) {
    return {
      name: 'Server name (reverse DNS)',
      status: 'info',
      title: 'Couldn’t find your mail server’s address',
      detail: `${topMx.exchange} did not return an A record. Reverse DNS check skipped.`,
      issues: [],
    };
  }

  const ip = aResult.value[0];
  const ptrResult = await reverse(ip);
  if (!ptrResult.ok) {
    return {
      name: 'Server name (reverse DNS)',
      status: 'warning',
      title: 'Your mail server has no name',
      detail: `${ip} has no reverse DNS. Receiving servers may flag or reject mail.`,
      issues: [
        {
          severity: 'warning',
          title: 'Your mail server’s address has no name attached',
          message: 'The server that handles your email has no name attached to its address, and some providers distrust that. Your email or hosting provider sets this, not you: ask them to add a reverse DNS (PTR) record.',
          fix: null,
        },
      ],
    };
  }

  return {
    name: 'Server name (reverse DNS)',
    status: 'pass',
    title: 'Your mail server has a name',
    detail: `${ip} -> ${ptrResult.value[0]}`,
    issues: [],
  };
}

// Nameservers

async function buildNameserversCheck(nsResult) {
  if (!nsResult.ok || nsResult.value.length === 0) {
    return {
      name: 'Nameservers',
      status: 'critical',
      title: 'No nameservers',
      detail: 'Domain may be misconfigured or expired.',
      issues: [
        {
          severity: 'critical',
          title: 'Nothing answers for this domain',
          message: 'No nameservers answer for this domain, so nothing about it can be looked up. Check the domain hasn’t expired and its DNS is set up.',
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
      title: 'Only one nameserver',
      message: 'Your domain has only one nameserver. If it goes down, your email and website stop working. Use at least two.',
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
      title: 'All nameservers on one network',
      message: 'All your nameservers are on one network, so one outage takes everything down. DNS providers like Cloudflare spread them out for you.',
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

// SOA

function buildSoaCheck(soaResult) {
  if (!soaResult.ok) {
    return {
      name: 'DNS zone settings (SOA)',
      status: 'warning',
      title: 'Couldn’t read the zone settings',
      detail: soaResult.error,
      issues: [],
    };
  }
  const soa = soaResult.value;
  return {
    name: 'DNS zone settings (SOA)',
    status: 'pass',
    title: 'Set up correctly',
    detail: `Serial: ${soa.serial}, Refresh: ${soa.refresh}s, Retry: ${soa.retry}s`,
    issues: [],
  };
}

// DNSSEC

async function buildDnssecCheck(domain) {
  // Attempt DNSKEY at the zone. A successful resolution with records means
  // the zone is DNSSEC-signed. If the underlying c-ares does not support
  // DNSKEY we fall back to an info result rather than a false negative.
  const res = await resolveGeneric(domain, 'DNSKEY', 3000);
  if (res.ok && Array.isArray(res.value) && res.value.length > 0) {
    return {
      name: 'DNSSEC (signed DNS)',
      status: 'pass',
      title: `Turned on`,
      detail: 'Zone is cryptographically signed. Resolvers can verify the integrity of DNS responses.',
      issues: [],
    };
  }
  if (res.code === 'EBADRESP' || res.code === 'ENOTIMP' || res.code === 'EUNKNOWN') {
    return {
      name: 'DNSSEC (signed DNS)',
      status: 'info',
      title: 'Couldn’t check',
      detail: 'This runtime does not support DNSKEY queries directly. A DNSSEC-aware resolver is needed for an authoritative check.',
      issues: [],
    };
  }
  return {
    name: 'DNSSEC (signed DNS)',
    status: 'info',
    title: 'Not turned on (optional)',
    detail: 'Optional security enhancement. Protects against DNS spoofing by signing the zone cryptographically.',
    issues: [],
  };
}

// CAA

function buildCaaCheck(caaResult) {
  if (!caaResult.ok) {
    return {
      name: 'Certificate rules (CAA)',
      status: 'info',
      title: 'Not set (optional)',
      detail: 'Optional. Restricts which certificate authorities can issue SSL certificates for this domain.',
      issues: [],
    };
  }
  const records = caaResult.value;
  if (!records || records.length === 0) {
    return {
      name: 'Certificate rules (CAA)',
      status: 'info',
      title: 'Not set (optional)',
      detail: 'Optional. Restricts which certificate authorities can issue SSL certificates for this domain.',
      issues: [],
    };
  }
  const issuers = records
    .map((r) => r.issue || r.issuewild)
    .filter(Boolean);
  return {
    name: 'Certificate rules (CAA)',
    status: 'pass',
    title: `Set (${records.length} entr${records.length !== 1 ? 'ies' : 'y'})`,
    detail: issuers.length > 0 ? `Authorised CAs: ${issuers.join(', ')}` : `${records.length} CAA record(s) present`,
    issues: [],
  };
}

// Blacklist checks

async function buildIpBlacklistCheck(mxResult) {
  if (!mxResult.ok || mxResult.value.length === 0) {
    return {
      name: 'Mail server blocklists',
      status: 'info',
      title: 'No mail server to check',
      detail: 'IP blacklist check skipped because no mail exchanger was found.',
      issues: [],
    };
  }

  const topMx = mxResult.value[0];
  const aResult = await resolve4(topMx.exchange);
  if (!aResult.ok || aResult.value.length === 0) {
    return {
      name: 'Mail server blocklists',
      status: 'info',
      title: 'Couldn’t find your mail server’s address',
      detail: `${topMx.exchange} did not return an A record. Blacklist check skipped.`,
      issues: [],
    };
  }

  const ip = aResult.value[0];
  const result = await checkIpBlacklists(ip);

  if (result.totalListed === 0) {
    return {
      name: 'Mail server blocklists',
      status: 'pass',
      title: `Not listed on any of ${result.totalChecked} lists`,
      detail: `Checked ${ip} against ${IP_BLACKLISTS.map((z) => z.name).join(', ')}${result.totalErrors > 0 ? ` (${result.totalErrors} zone${result.totalErrors !== 1 ? 's' : ''} errored)` : ''}.`,
      issues: [],
    };
  }

  const issues = result.listedOn.map((hit) => ({
    severity: 'critical',
    title: `Listed on ${hit.zone.name}`,
    message: `The server that sends your email (${ip}) is on ${hit.zone.name}. ${hit.zone.notes} Providers that check this list may refuse or filter your email.`,
    fix: { type: 'external', label: `Removal at ${hit.zone.name}`, url: hit.zone.delistUrl },
  }));

  return {
    name: 'Mail server blocklists',
    status: 'critical',
    title: `Listed on ${result.totalListed} of ${result.totalChecked} lists`,
    detail: `${ip} appears on: ${result.listedOn.map((h) => h.zone.name).join(', ')}`,
    issues,
  };
}

async function buildDomainBlacklistCheck(domain) {
  const result = await checkDomainBlacklists(domain);

  if (result.totalListed === 0) {
    return {
      name: 'Domain blocklists',
      status: 'pass',
      title: 'Not listed',
      detail: `Checked ${result.totalChecked} zones including Spamhaus DBL and SURBL${result.totalErrors > 0 ? ` (${result.totalErrors} errored)` : ''}.`,
      issues: [],
    };
  }

  const issues = result.listedOn.map((hit) => ({
    severity: 'critical',
    title: `Listed on ${hit.zone.name}`,
    message: `${domain} is on ${hit.zone.name}. ${hit.zone.notes} Providers that check this list may refuse or filter your email.`,
    fix: { type: 'external', label: `Removal at ${hit.zone.name}`, url: hit.zone.delistUrl },
  }));

  return {
    name: 'Domain blocklists',
    status: 'critical',
    title: `Listed on ${result.totalListed} of ${result.totalChecked} lists`,
    detail: `Appears on: ${result.listedOn.map((h) => h.zone.name).join(', ')}`,
    issues,
  };
}

// SMTP Connectivity

async function buildSmtpConnectivityCheck(mxResult) {
  if (!mxResult.ok || mxResult.value.length === 0) {
    return {
      name: 'Mail server reachable',
      status: 'info',
      title: 'No mail server to check',
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
        name: 'Mail server reachable',
        status: 'info',
        title: 'Couldn’t reach your mail server',
        detail: `${topMx.exchange}:25 did not respond. The scanner may be blocked from outbound port 25.`,
        issues: [
          {
            severity: 'info',
            title: 'Your mail server didn’t answer us',
            message: 'We couldn’t reach your mail server on port 25, but many networks block that port for checks like this one. Email from other providers almost certainly still reaches you.',
            fix: null,
          },
        ],
      };
    }
    // Non-timeout failures (connection refused, DNS error, protocol error)
    // are more likely to reflect a real remote problem.
    return {
      name: 'Mail server reachable',
      status: 'warning',
      title: 'Your mail server didn’t finish answering',
      detail: `${topMx.exchange}:25 - ${probe.error}`,
      issues: [
        {
          severity: 'warning',
          title: 'Your mail server cut the connection',
          message: 'Your mail server answered but didn’t finish the conversation. It may slow down unknown visitors on purpose, or be having a brief problem. Try again in a few minutes.',
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
      title: 'Email to you isn’t encrypted',
      message:
        'Email sent to your server isn’t encrypted, so it could be read on the way, and some providers refuse to deliver it. Ask your email host to turn on encryption (STARTTLS).',
      fix: null,
    });
  } else if (probe.tlsVersion && /TLSv1(\.0|\.1)?$/i.test(probe.tlsVersion)) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Old encryption version: ${probe.tlsVersion}`,
      message:
        'Your mail server uses an old encryption version that modern providers may refuse. Ask your email host to support TLS 1.2 or newer.',
      fix: null,
    });
  }

  const titleParts = [`Reachable`];
  if (probe.tlsVersion) titleParts.push(`encrypted (${probe.tlsVersion})`);
  else if (probe.supportsStarttls) titleParts.push('offers encryption');

  return {
    name: 'Mail server reachable',
    status,
    title: titleParts.join(', '),
    detail: `${topMx.exchange}:25${probe.tlsCipher ? ` via ${probe.tlsCipher}` : ''}`,
    issues,
  };
}

// SSL / TLS Certificate

async function buildSslCheck(domain) {
  const probe = await probeSsl(domain);

  if (!probe.ok) {
    return {
      name: 'Website certificate (SSL)',
      status: 'warning',
      title: 'No certificate found',
      detail: `${domain}:443 - ${probe.error}`,
      issues: [
        {
          severity: 'warning',
          title: 'Your website doesn’t answer securely',
          message:
            'Your website doesn’t answer securely (HTTPS). If the domain is only for email, that’s fine; if it has a website, set up a certificate.',
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
      title: 'Expired',
      message: `Your website’s certificate expired ${Math.abs(daysUntilExpiry)} days ago, so browsers show a warning. Renew it now.`,
      fix: null,
    });
  } else if (daysUntilExpiry !== null && daysUntilExpiry < 14) {
    status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Expires in ${daysUntilExpiry} days`,
      message:
        'Turn on automatic renewal, or renew it before it expires. Let’s Encrypt certificates are free and renew themselves.',
      fix: null,
    });
  }

  if (!matchesHostname) {
    status = 'critical';
    issues.push({
      severity: 'critical',
      title: 'The certificate is for a different name',
      message: `Your website’s certificate is for ${cert.subjectCn || 'a different domain'}, not ${domain}, so browsers show a warning. Get a certificate that includes ${domain}.`,
      fix: null,
    });
  }

  if (tlsVersion && /TLSv1(\.0|\.1)?$/i.test(tlsVersion)) {
    if (status === 'pass') status = 'warning';
    issues.push({
      severity: 'warning',
      title: `Old encryption version: ${tlsVersion}`,
      message: 'Your website uses an old encryption version. Ask your host to support TLS 1.2 or newer.',
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
    name: 'Website certificate (SSL)',
    status,
    title: status === 'pass'
      ? `Valid, ${expiryText}`
      : 'SSL certificate has issues',
    detail: `${issuerText}, ${tlsVersion || 'TLS version unknown'}, ${expiryText}`,
    issues,
  };
}

// HTTPS Redirect

async function buildHttpsRedirectCheck(domain) {
  const probe = await probeHttpsRedirect(domain);

  if (!probe.ok) {
    return {
      name: 'Secure website redirect',
      status: 'info',
      title: 'Not reachable',
      detail: probe.error || 'No response on port 80.',
      issues: [],
    };
  }

  if (!probe.redirectsToHttps) {
    return {
      name: 'Secure website redirect',
      status: 'warning',
      title: 'Not sent to the secure version',
      detail: `Final URL: ${probe.finalUrl}`,
      issues: [
        {
          severity: 'warning',
          title: 'Visitors can land on the unsecured version',
          message:
            'Visitors who type http://' + domain + ' aren’t sent to the secure https:// version. Ask your host to redirect them.',
          fix: null,
        },
      ],
    };
  }

  const firstHop = probe.firstHopStatus;
  const isPermanent = firstHop === 301 || firstHop === 308;

  return {
    name: 'Secure website redirect',
    status: 'pass',
    title: isPermanent
      ? `Sends visitors to the secure version`
      : `HTTP redirects to HTTPS (${firstHop || 'non-permanent'})`,
    detail: `Final URL: ${probe.finalUrl}`,
    issues: [],
  };
}

// Security Headers

function buildSecurityHeadersCheck(websiteProbe) {
  if (!websiteProbe || !websiteProbe.ok) {
    return {
      name: 'Website security settings',
      status: 'info',
      title: 'Not checked',
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
      title: `${missing.length} security setting${missing.length !== 1 ? 's' : ''} missing`,
      message: `Missing: ${missing.join(', ')}. These settings protect your website from common attacks. Your host or CDN can add them.`,
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
    name: 'Website security settings',
    status,
    title: `${present} of ${sh.criticalTotal} security settings in place`,
    detail: summaryParts.join(', '),
    issues,
  };
}

// Website

function buildWebsiteCheck(websiteProbe) {
  if (!websiteProbe || !websiteProbe.ok) {
    return {
      name: 'Website',
      status: 'info',
      title: 'No website answering',
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
      title: `Your website shows an error (${status})`,
      message: 'Your website is returning an error. Fix it if the domain should have a website.',
      fix: null,
    });
  } else if (status >= 400) {
    checkStatus = 'warning';
    issues.push({
      severity: 'warning',
      title: `Your homepage shows an error (${status})`,
      message: 'Your homepage can’t be found. If the domain isn’t used for a website, ignore this; otherwise check your site.',
      fix: null,
    });
  } else if (responseTimeMs > 3000) {
    checkStatus = 'warning';
    issues.push({
      severity: 'warning',
      title: `Slow: ${(responseTimeMs / 1000).toFixed(1)} seconds`,
      message: 'Your website takes over 3 seconds to answer. Ask your host to look at its speed.',
      fix: null,
    });
  }

  return {
    name: 'Website',
    status: checkStatus,
    title: `Working (${(responseTimeMs / 1000).toFixed(1)} seconds)`,
    detail: `GET https://${websiteProbe.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}/`,
    issues,
  };
}

// Pending (Session 2) stubs

function pendingInfo(name, reason) {
  return {
    name,
    status: 'info',
    title: 'Not checked yet',
    detail: reason,
    issues: [],
  };
}

// Orchestrator

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
      label: 'Proof it\u2019s really you',
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
      label: 'Mail server',
      icon: 'server',
      checks: [
        buildMxCheck(mxResult, detectedProvider),
        smtpConnectivityCheck,
        reverseDnsCheck,
      ],
    },
    {
      id: 'reputation',
      label: 'Blocklists',
      icon: 'reputation',
      checks: [
        ipBlacklistCheck,
        domainBlacklistCheck,
      ],
    },
    {
      id: 'webSecurity',
      label: 'Website',
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
      label: 'DNS setup',
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
