/* ═══════════════════════════════════════════════════════════════════════════
   dnsRecords.js
   Pure data and builders for the DNS Record Generator.

   No React, no DOM, no side effects. Every export is tree-shakeable and
   unit-testable. Runs identically in the browser and in Node.

   Organised as:
     1. Constants:           PROVIDERS, SENDING_SERVICES, REGISTRARS, DMARC_POLICIES
     2. Validators:          validateDomain, validateReportEmail, validateDkimPublicKey,
                             validateBimiLogoUrl
     3. Helpers:              chunkDkimValue
     4. Record builders:      buildSpfRecord, buildDmarcRecord, getDkimRecords,
                             buildMxRecords, buildBimiRecord, buildMtaStsRecords

   SPF lookup costs for well-known includes are taken from each provider's
   published SPF record as of early 2026. They are reasonably stable but can
   drift. When adding a provider, verify the include's actual lookup cost with
   a tool like Kitterman or by resolving the TXT chain yourself.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── 1. CONSTANTS ───────────────────────────────────────────────────────── */

/**
 * PROVIDERS = primary email hosts where a mailbox lives.
 *
 * Shape:
 *   id                 stable identifier
 *   name               display label
 *   desc               short descriptor shown on the provider card
 *   spfInclude         domain that goes after "include:" (omitted for custom)
 *   spfLookupCost      number of DNS lookups this include consumes
 *   spfRaw             raw SPF fragment for providers that do not use include
 *                      (cPanel uses "+a +mx" because the mailbox is on the
 *                      same host as the domain)
 *   spfCustom          true for the "Custom SMTP" option; the user supplies
 *                      their own mechanism
 *   mx                 array of MX records in { priority, host } form. host
 *                      may be a function of domain when the record depends on
 *                      the customer tenant
 *   mxNote             optional note shown above the MX block
 *   dkim.type          'txt' | 'cname' | 'manual'
 *   dkim.selector      the canonical selector for this provider
 *   dkim.setupUrl      deep link to the provider's DKIM setup page
 *   dkim.instructions  user-facing instructions on how to retrieve the key
 *   dkim.records       array of DKIM record templates. value may be a literal
 *                      or, for patterns that depend on domain, a valueFn.
 *                      Each record has a status:
 *                        'provider_generated'  value must be copied from the
 *                                              admin console
 *                        'ready'               value is computable from inputs
 */
export const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Workspace',
    desc: 'Gmail for business',
    spfInclude: '_spf.google.com',
    spfLookupCost: 3,
    mx: [{ priority: 1, host: 'smtp.google.com' }],
    mxNote: 'Google consolidated to a single MX host in 2023. If you set up Workspace earlier and have five ASPMX records, you can keep them or migrate to the single-host record.',
    dkim: {
      type: 'txt',
      selector: 'google',
      setupUrl: 'https://admin.google.com/ac/apps/gmail/authenticateemail',
      instructions: 'Open Google Admin Console, go to Apps, Google Workspace, Gmail, Authenticate email, and enable DKIM. Google will display the public key value once the domain is added. Paste it into the field above to see the final record.',
      records: [
        {
          host: 'google._domainkey',
          type: 'TXT',
          value: 'Generated in Google Admin Console after adding this record',
          status: 'provider_generated',
          note: 'Create the empty TXT record first, then activate DKIM in Google Admin. Google will provide the public key value.',
        },
      ],
    },
  },

  {
    id: 'microsoft',
    name: 'Microsoft 365',
    desc: 'Outlook for business',
    spfInclude: 'spf.protection.outlook.com',
    spfLookupCost: 3,
    mx: [
      {
        priority: 0,
        host: (domain) => {
          const d = (domain || 'yourdomain-com').replace(/\./g, '-');
          return `${d}.mail.protection.outlook.com`;
        },
      },
    ],
    mxNote: 'Microsoft 365 generates a unique MX target per tenant. The pattern is <domain-with-dashes>.mail.protection.outlook.com. Verify the exact value in the Microsoft 365 admin centre.',
    dkim: {
      type: 'cname',
      selector: 'selector1',
      setupUrl: 'https://security.microsoft.com/dkimv2',
      instructions: 'Open the Microsoft Defender portal, go to Email & collaboration, Policies & rules, Threat policies, Email authentication settings, DKIM. Select the domain and enable signing. Microsoft rotates two selectors for key rotation, so both CNAMEs must be published.',
      records: [
        {
          host: 'selector1._domainkey',
          type: 'CNAME',
          valueFn: (domain) => {
            const d = (domain || 'yourdomain').split('.')[0];
            const sanitized = (domain || 'yourdomain-com').replace(/\./g, '-');
            return `selector1-${sanitized}._domainkey.${d}.onmicrosoft.com`;
          },
          status: 'ready',
          note: 'The onmicrosoft.com portion uses your tenant name, not your custom domain. Verify the exact value in the Microsoft admin portal.',
        },
        {
          host: 'selector2._domainkey',
          type: 'CNAME',
          valueFn: (domain) => {
            const d = (domain || 'yourdomain').split('.')[0];
            const sanitized = (domain || 'yourdomain-com').replace(/\./g, '-');
            return `selector2-${sanitized}._domainkey.${d}.onmicrosoft.com`;
          },
          status: 'ready',
          note: 'Second selector used for key rotation. Microsoft signs with selector1 for six months, then rotates to selector2.',
        },
      ],
    },
  },

  {
    id: 'zoho',
    name: 'Zoho Mail',
    desc: 'Zoho email suite',
    spfInclude: 'zoho.com',
    spfLookupCost: 2,
    mx: [
      { priority: 10, host: 'mx.zoho.com' },
      { priority: 20, host: 'mx2.zoho.com' },
      { priority: 50, host: 'mx3.zoho.com' },
    ],
    dkim: {
      type: 'txt',
      selector: 'zmail',
      setupUrl: 'https://mailadmin.zoho.com/cpanel/home.do#email-config/dkim',
      instructions: 'Open Zoho Mail Admin, go to Email Configuration, Email Authentication, DKIM. Select your domain, generate a DKIM key, and copy the public key value Zoho displays. Paste it above to see the final TXT record.',
      records: [
        {
          host: 'zmail._domainkey',
          type: 'TXT',
          value: 'Generated in Zoho Mail Admin after enabling DKIM',
          status: 'provider_generated',
          note: 'Zoho generates a unique public key per domain. Copy the value from the Zoho admin panel.',
        },
      ],
    },
  },

  {
    id: 'cpanel',
    name: 'cPanel Webmail',
    desc: 'Shared hosting email',
    spfRaw: '+a +mx',
    mx: [{ priority: 0, host: (domain) => `mail.${domain || 'yourdomain.com'}` }],
    mxNote: 'cPanel typically uses mail.<yourdomain> as the MX target, with an A record pointing to the hosting server. Confirm the exact hostname in your cPanel Email Routing settings.',
    dkim: {
      type: 'txt',
      selector: 'default',
      setupUrl: null,
      instructions: 'Open cPanel, go to Email Deliverability (older cPanel versions call it Email Authentication). Select your domain and click Manage. cPanel can auto-install the DKIM record if DNS is managed on the same server. If DNS is external, copy the displayed DKIM value and paste it above.',
      records: [
        {
          host: 'default._domainkey',
          type: 'TXT',
          value: 'Generated in cPanel Email Deliverability section',
          status: 'provider_generated',
          note: 'cPanel generates a unique key per domain. Retrieve it from Email Deliverability in cPanel.',
        },
      ],
    },
  },

  {
    id: 'fastmail',
    name: 'Fastmail',
    desc: 'Privacy-focused email',
    spfInclude: 'spf.messagingengine.com',
    spfLookupCost: 1,
    mx: [
      { priority: 10, host: 'in1-smtp.messagingengine.com' },
      { priority: 20, host: 'in2-smtp.messagingengine.com' },
    ],
    dkim: {
      type: 'cname',
      selector: 'fm1',
      setupUrl: 'https://www.fastmail.com/settings/domains',
      instructions: 'Open Fastmail Settings, Domains, select your domain. Fastmail uses three CNAME records for DKIM key rotation. The targets follow the pattern fm1.<yourdomain>.dkim.fmhosted.com, generated automatically from your domain.',
      records: [
        {
          host: 'fm1._domainkey',
          type: 'CNAME',
          valueFn: (domain) => `fm1.${domain || 'yourdomain.com'}.dkim.fmhosted.com`,
          status: 'ready',
          note: 'First selector. Fastmail rotates across three keys.',
        },
        {
          host: 'fm2._domainkey',
          type: 'CNAME',
          valueFn: (domain) => `fm2.${domain || 'yourdomain.com'}.dkim.fmhosted.com`,
          status: 'ready',
          note: 'Second selector for key rotation.',
        },
        {
          host: 'fm3._domainkey',
          type: 'CNAME',
          valueFn: (domain) => `fm3.${domain || 'yourdomain.com'}.dkim.fmhosted.com`,
          status: 'ready',
          note: 'Third selector for key rotation.',
        },
      ],
    },
  },

  {
    id: 'protonmail',
    name: 'Proton Mail',
    desc: 'Encrypted email',
    spfInclude: '_spf.protonmail.ch',
    spfLookupCost: 1,
    mx: [
      { priority: 10, host: 'mail.protonmail.ch' },
      { priority: 20, host: 'mailsec.protonmail.ch' },
    ],
    dkim: {
      type: 'cname',
      selector: 'protonmail',
      setupUrl: 'https://account.proton.me/mail/domain-names',
      instructions: 'Open Proton Mail Settings, Domain Names, select your domain, DKIM tab. Proton generates three CNAME targets with a domain-specific hash. Copy each target from the Proton panel; the XXXX placeholder below represents the hash Proton will provide.',
      records: [
        {
          host: 'protonmail._domainkey',
          type: 'CNAME',
          value: 'protonmail.domainkey.XXXX.domains.proton.ch',
          status: 'provider_generated',
          note: 'Copy the exact CNAME target from the Proton admin panel. The XXXX portion is unique to your domain.',
        },
        {
          host: 'protonmail2._domainkey',
          type: 'CNAME',
          value: 'protonmail2.domainkey.XXXX.domains.proton.ch',
          status: 'provider_generated',
          note: 'Second selector. Copy from the Proton admin panel.',
        },
        {
          host: 'protonmail3._domainkey',
          type: 'CNAME',
          value: 'protonmail3.domainkey.XXXX.domains.proton.ch',
          status: 'provider_generated',
          note: 'Third selector. Copy from the Proton admin panel.',
        },
      ],
    },
  },

  {
    id: 'titan',
    name: 'Titan Mail',
    desc: 'Namecheap / Hostinger email',
    spfInclude: 'spf.titan.email',
    spfLookupCost: 1,
    mx: [
      { priority: 10, host: 'mx1.titan.email' },
      { priority: 20, host: 'mx2.titan.email' },
    ],
    dkim: {
      type: 'txt',
      selector: 'titan',
      setupUrl: null,
      instructions: 'Open your Titan admin panel (accessed through Namecheap, Hostinger, or your hosting provider). Go to Domain Settings, Email Authentication, DKIM. Copy the TXT value Titan displays and paste it above.',
      records: [
        {
          host: 'titan._domainkey',
          type: 'TXT',
          value: 'Generated in Titan admin panel',
          status: 'provider_generated',
          note: 'Titan generates a unique DKIM key per domain. Retrieve it from the Titan email admin.',
        },
      ],
    },
  },

  {
    id: 'custom',
    name: 'Custom SMTP',
    desc: 'Your own mail server',
    spfCustom: true,
    mx: [{ priority: 10, host: (domain) => `mail.${domain || 'yourdomain.com'}` }],
    mxNote: 'A self-hosted mail server typically uses mail.<yourdomain> as the MX target, with an A record pointing to the server IP. Adjust the hostname if your server uses a different naming convention.',
    dkim: {
      type: 'manual',
      selector: 'default',
      setupUrl: null,
      instructions: 'Generate a DKIM keypair on your mail server (opendkim, rspamd, or equivalent). Publish the public key as a TXT record and keep the private key on the server. Selector "default" is conventional but any unique label works.',
      records: [],
    },
  },
];

/**
 * SENDING_SERVICES = transactional or bulk email APIs. Only contribute an SPF
 * include. DKIM for each service is configured inside the service dashboard
 * and handled out-of-band.
 */
export const SENDING_SERVICES = [
  { id: 'ses', name: 'Amazon SES', spfInclude: 'amazonses.com', spfLookupCost: 1 },
  { id: 'sendgrid', name: 'SendGrid', spfInclude: 'sendgrid.net', spfLookupCost: 3 },
  { id: 'mailgun', name: 'Mailgun', spfInclude: 'mailgun.org', spfLookupCost: 2 },
  { id: 'postmark', name: 'Postmark', spfInclude: 'spf.mtasv.net', spfLookupCost: 2 },
  { id: 'resend', name: 'Resend', spfInclude: 'amazonses.com', spfLookupCost: 1 },
  { id: 'brevo', name: 'Brevo', spfInclude: 'sendinblue.com', spfLookupCost: 2 },
];

/**
 * REGISTRARS. Each has a name, TTL guidance, quoting hint (how that registrar
 * expects TXT values formatted), and step-by-step instructions. The quoting
 * hint drives a subtle UI note so users don't double-wrap values.
 */
export const REGISTRARS = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    ttlLabel: 'Auto',
    quoting: 'unquoted',
    dashboardUrl: 'https://dash.cloudflare.com/',
    steps: [
      'Log in to your Cloudflare dashboard',
      'Select your domain',
      'Go to DNS, Records',
      'Click Add record',
      'Set Type to TXT (or CNAME for DKIM if needed)',
      'Enter the Name (host) and Value from the record below',
      'Leave Proxy status off for TXT records',
      'Set TTL to Auto',
      'Click Save',
    ],
  },
  {
    id: 'namecheap',
    name: 'Namecheap',
    ttlLabel: 'Automatic',
    quoting: 'auto_wrapped',
    dashboardUrl: 'https://ap.www.namecheap.com/',
    steps: [
      'Log in to your Namecheap account',
      'Go to Domain List, Manage next to your domain',
      'Open the Advanced DNS tab',
      'Click Add New Record',
      'Select TXT Record (or CNAME for DKIM if required)',
      'Enter the Host and Value from the record below',
      'Set TTL to Automatic',
      'Click the green checkmark to save',
    ],
  },
  {
    id: 'godaddy',
    name: 'GoDaddy',
    ttlLabel: '1 Hour',
    quoting: 'auto_wrapped',
    dashboardUrl: 'https://account.godaddy.com/products',
    steps: [
      'Log in to your GoDaddy account',
      'Go to My Products, Domains, DNS',
      'Click Add under Records',
      'Select TXT from the Type dropdown',
      'Enter the Name and Value from the record below',
      'Set TTL to 1 Hour',
      'Click Save',
    ],
  },
  {
    id: 'other',
    name: 'Other',
    ttlLabel: '3600',
    quoting: 'depends',
    dashboardUrl: null,
    steps: [
      'Log in to your domain registrar or DNS provider',
      'Navigate to DNS management or zone editor',
      'Add a new TXT record (or CNAME for DKIM if required)',
      'Enter the Host and Value from the record below',
      'Save and wait for propagation, typically 1-4 hours',
    ],
  },
];

/**
 * DMARC policies. Each has its semantic label, a short description, and a
 * recommendation flag used by the UI to steer new users.
 */
export const DMARC_POLICIES = [
  {
    id: 'none',
    label: 'None',
    desc: 'Monitor only. No emails blocked. Best for initial setup.',
    recommendedFor: 'new-setup',
    strength: 1,
  },
  {
    id: 'quarantine',
    label: 'Quarantine',
    desc: 'Failed emails go to spam. Recommended after 2-4 weeks of monitoring.',
    recommendedFor: 'ramp-up',
    strength: 2,
  },
  {
    id: 'reject',
    label: 'Reject',
    desc: 'Failed emails blocked entirely. Use once authentication is trusted.',
    recommendedFor: 'mature',
    strength: 3,
  },
];

/* ─── 2. VALIDATORS ──────────────────────────────────────────────────────── */

/**
 * Domain validator. RFC 1035 + 1123 compliant, ASCII only (users with IDN
 * domains should convert to punycode before entry). Strips common paste
 * mistakes: protocol prefix, www prefix, trailing path.
 *
 * Returns { valid, normalized } on success and { valid: false, error } on
 * failure. error is a short human-readable string safe to render directly.
 */
export function validateDomain(input) {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Domain must be text' };
  }
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'Enter a domain' };
  }
  if (trimmed.length > 253) {
    return { valid: false, error: 'Domain exceeds 253 characters' };
  }
  const cleaned = trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (!cleaned.includes('.')) {
    return { valid: false, error: 'Enter a full domain like example.com' };
  }
  const labels = cleaned.split('.');
  if (labels.length < 2) {
    return { valid: false, error: 'Enter a full domain like example.com' };
  }
  const labelPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const label of labels) {
    if (!labelPattern.test(label)) {
      return { valid: false, error: `Invalid domain segment: "${label}"` };
    }
  }
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || /^\d+$/.test(tld)) {
    return { valid: false, error: 'Top-level domain looks invalid' };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * Report email validator for DMARC rua/ruf addresses.
 * Empty input is considered valid because the component supplies a default.
 */
export function validateReportEmail(input) {
  if (!input) return { valid: true, normalized: '' };
  const trimmed = String(input).trim();
  if (!trimmed) return { valid: true, normalized: '' };
  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }
  // Simple, anchored, non-catastrophic pattern. Good enough for UI hints; the
  // authoritative check happens when reports actually send.
  const pattern = /^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
  if (!pattern.test(trimmed)) {
    return { valid: false, error: 'Enter a valid email address' };
  }
  return { valid: true, normalized: trimmed.toLowerCase() };
}

/**
 * DKIM public key validator. Accepts either a raw base64 key or a PEM block;
 * strips PEM markers and whitespace, then validates the base64.
 */
export function validateDkimPublicKey(input) {
  if (!input) return { valid: true, normalized: '' };
  const raw = String(input);
  const stripped = raw
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/-----BEGIN RSA PUBLIC KEY-----/g, '')
    .replace(/-----END RSA PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!stripped) {
    return { valid: false, error: 'Key is empty after trimming whitespace' };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(stripped)) {
    return { valid: false, error: 'Key contains non-base64 characters. Paste the public key value only.' };
  }
  // A 1024-bit RSA public key in base64 is ~216 chars. Anything shorter is
  // almost certainly truncated.
  if (stripped.length < 120) {
    return { valid: false, error: 'Key is too short to be a valid DKIM public key' };
  }
  return { valid: true, normalized: stripped };
}

/**
 * BIMI logo URL validator. BIMI requires:
 *   - HTTPS (not HTTP)
 *   - SVG Tiny P/S format (ends in .svg)
 *   - Publicly reachable
 *   - Valid TLS certificate (we cannot verify from the client, only note it)
 */
export function validateBimiLogoUrl(input) {
  if (!input) return { valid: false, error: 'Logo URL is required' };
  const trimmed = String(input).trim();
  if (!/^https:\/\//i.test(trimmed)) {
    return { valid: false, error: 'Logo URL must start with https://' };
  }
  try {
    const url = new URL(trimmed);
    if (!/\.svg(\?|$)/i.test(url.pathname)) {
      return { valid: false, error: 'Logo URL must end in .svg (SVG Tiny P/S required)' };
    }
    return { valid: true, normalized: trimmed };
  } catch {
    return { valid: false, error: 'Logo URL is not a valid URL' };
  }
}

/* ─── 3. HELPERS ─────────────────────────────────────────────────────────── */

/**
 * Split a DKIM public key into RFC 6376 compliant 255-character quoted
 * strings. Most DNS panels require this for long keys; some silently truncate
 * if the value isn't pre-split.
 *
 * Returns:
 *   value        the formatted TXT value, with quoted segments
 *   chunks       number of segments
 *   needsChunking  true if the key required splitting
 */
export function chunkDkimValue(key, options = {}) {
  const chunkSize = options.chunkSize || 255;
  const selector = options.tags || 'v=DKIM1; k=rsa; p=';
  const full = `${selector}${key}`;
  if (full.length <= chunkSize) {
    return { value: `"${full}"`, chunks: 1, needsChunking: false };
  }
  const parts = [];
  for (let i = 0; i < full.length; i += chunkSize) {
    parts.push(full.slice(i, i + chunkSize));
  }
  return {
    value: parts.map((p) => `"${p}"`).join(' '),
    chunks: parts.length,
    needsChunking: true,
  };
}

/**
 * Identify the costliest source in an SPF breakdown. Used to suggest a fix
 * when the 10-lookup limit is exceeded.
 */
function identifyHeaviestSource(sources) {
  const costly = sources.filter((s) => s.lookupCost > 0);
  if (costly.length === 0) return null;
  return [...costly].sort((a, b) => b.lookupCost - a.lookupCost)[0];
}

/* ─── 4. RECORD BUILDERS ─────────────────────────────────────────────────── */

/**
 * Build the SPF record for a given provider + additional providers + sending
 * services. Counts DNS lookups per RFC 7208 and returns warnings when the
 * 10-lookup ceiling is approached or exceeded.
 *
 * Arguments (all optional except provider):
 *   provider                  PROVIDERS entry (the primary)
 *   additionalProviderIds     array of provider ids also sending from the domain
 *   serviceIds                array of SENDING_SERVICES ids
 *   customSpf                 raw string used when provider.spfCustom is true
 *   strict                    true for -all, false for ~all (default)
 *
 * Returns:
 *   record        the full SPF TXT value
 *   sources       [{ label, mechanism, lookupCost, origin }] for UI breakdown
 *   totalLookups  integer
 *   warnings      [{ level, code, message, fix? }]
 *   strict        mirror of the strict arg
 *   terminal      the terminal mechanism string (~all or -all)
 */
export function buildSpfRecord(options = {}) {
  const {
    provider,
    additionalProviderIds = [],
    serviceIds = [],
    customSpf = '',
    strict = false,
  } = options;

  const sources = [];
  const mechanisms = [];

  const appendProvider = (p, origin) => {
    if (!p) return;
    if (p.spfCustom) return; // handled separately
    if (p.spfRaw) {
      const parts = p.spfRaw.split(/\s+/).filter(Boolean);
      for (const mech of parts) {
        mechanisms.push(mech);
        const cost = /^(\+?a|\+?mx|a:|mx:)$/.test(mech) ? 1 : 0;
        sources.push({ label: p.name, mechanism: mech, lookupCost: cost, origin });
      }
      return;
    }
    if (p.spfInclude) {
      const mech = `include:${p.spfInclude}`;
      mechanisms.push(mech);
      sources.push({
        label: p.name,
        mechanism: mech,
        lookupCost: p.spfLookupCost ?? 1,
        origin,
      });
    }
  };

  if (provider) {
    if (provider.spfCustom) {
      const raw = (customSpf || '').trim();
      if (raw) {
        const looksLikeMechanism = /^(include:|ip4:|ip6:|a|mx|a:|mx:|exists:|ptr)/.test(raw);
        const mech = looksLikeMechanism ? raw : `include:${raw}`;
        mechanisms.push(mech);
        const cost = mech.startsWith('ip4:') || mech.startsWith('ip6:')
          ? 0
          : 1; // conservative estimate for user-supplied mechanisms
        sources.push({
          label: provider.name,
          mechanism: mech,
          lookupCost: cost,
          origin: 'custom',
        });
      }
    } else {
      appendProvider(provider, 'provider');
    }
  }

  for (const id of additionalProviderIds) {
    const p = PROVIDERS.find((pr) => pr.id === id);
    appendProvider(p, 'additional-provider');
  }

  for (const id of serviceIds) {
    const s = SENDING_SERVICES.find((sv) => sv.id === id);
    if (!s) continue;
    const mech = `include:${s.spfInclude}`;
    mechanisms.push(mech);
    sources.push({
      label: s.name,
      mechanism: mech,
      lookupCost: s.spfLookupCost ?? 1,
      origin: 'service',
    });
  }

  const totalLookups = sources.reduce((sum, s) => sum + s.lookupCost, 0);
  const terminal = strict ? '-all' : '~all';
  const record =
    mechanisms.length > 0
      ? `v=spf1 ${mechanisms.join(' ')} ${terminal}`
      : `v=spf1 ${terminal}`;

  const warnings = [];
  if (totalLookups > 10) {
    const heaviest = identifyHeaviestSource(sources);
    warnings.push({
      level: 'critical',
      code: 'SPF_TOO_MANY_LOOKUPS',
      message: `SPF has ${totalLookups} DNS lookups. RFC 7208 allows a maximum of 10.`,
      fix: heaviest
        ? `Consider removing ${heaviest.label} (costs ${heaviest.lookupCost} lookups) or consolidating sending services.`
        : 'Reduce the number of include mechanisms.',
    });
  } else if (totalLookups > 8) {
    warnings.push({
      level: 'warning',
      code: 'SPF_APPROACHING_LIMIT',
      message: `SPF uses ${totalLookups} of 10 allowed DNS lookups.`,
      fix: 'Adding one more service with multiple nested lookups could push you over the limit.',
    });
  }

  return { record, sources, totalLookups, warnings, strict, terminal };
}

/**
 * Build the DMARC record. Supports the full tag set most senders need:
 *   v, p, sp, pct, adkim/aspf, rua, ruf, fo.
 *
 * Arguments:
 *   policy          'none' | 'quarantine' | 'reject'
 *   subdomainPolicy undefined | 'none' | 'quarantine' | 'reject' | 'inherit'
 *   pct             0-100 (inclusive); omitted when 100
 *   reportEmail     rua recipient; defaults to dmarc@<domain>
 *   forensicEmail   ruf recipient; when set, fo=1 is added
 *   alignment       'relaxed' | 'strict'; strict sets adkim=s aspf=s
 *   domain          used for the default report email
 *
 * Returns:
 *   record    the full DMARC TXT value
 *   host      always "_dmarc"
 *   tags      array of tag strings, in canonical order
 *   warnings  [{ level, code, message, fix? }]
 */
export function buildDmarcRecord(options = {}) {
  const {
    policy = 'none',
    subdomainPolicy,
    pct = 100,
    reportEmail = '',
    forensicEmail = '',
    alignment = 'relaxed',
    domain = '',
  } = options;

  const effectiveEmail = (reportEmail || '').trim() || `dmarc@${domain || 'yourdomain.com'}`;
  const numericPct = Math.max(0, Math.min(100, Number(pct) || 100));

  const tags = [`v=DMARC1`, `p=${policy}`];

  if (subdomainPolicy && subdomainPolicy !== 'inherit') {
    tags.push(`sp=${subdomainPolicy}`);
  }
  if (numericPct < 100) {
    tags.push(`pct=${numericPct}`);
  }
  if (alignment === 'strict') {
    tags.push('adkim=s');
    tags.push('aspf=s');
  }
  tags.push(`rua=mailto:${effectiveEmail}`);
  if ((forensicEmail || '').trim()) {
    tags.push(`ruf=mailto:${forensicEmail.trim()}`);
    tags.push('fo=1');
  }

  const record = tags.join('; ');

  const warnings = [];
  if (policy === 'none' && numericPct === 100) {
    warnings.push({
      level: 'info',
      code: 'DMARC_MONITOR_ONLY',
      message: 'Monitor-only. Nothing is quarantined or rejected.',
      fix: 'Review reports for 2-4 weeks, then move to quarantine at a low pct and ramp up.',
    });
  }
  if (policy === 'reject' && numericPct < 100) {
    warnings.push({
      level: 'warning',
      code: 'DMARC_PARTIAL_REJECT',
      message: `Only ${numericPct}% of failing mail is rejected; the rest is treated as p=none.`,
    });
  }
  if (policy === 'reject' && (!subdomainPolicy || subdomainPolicy === 'inherit')) {
    warnings.push({
      level: 'info',
      code: 'DMARC_NO_SUBDOMAIN_POLICY',
      message: 'Subdomains inherit the reject policy. Set sp= if subdomains should be handled differently.',
    });
  }
  if (!(reportEmail || '').trim()) {
    warnings.push({
      level: 'info',
      code: 'DMARC_DEFAULT_REPORT',
      message: `Reports will go to dmarc@${domain || 'yourdomain.com'}. Create that mailbox or use a DMARC reporting service.`,
    });
  }

  return { record, host: '_dmarc', tags, warnings };
}

/**
 * Get the DKIM records to publish for a given provider. If the user has
 * pasted a DKIM public key and the provider is TXT-based, the record value is
 * finalised using chunkDkimValue. Otherwise the record is rendered with its
 * provider-generated placeholder and status.
 */
export function getDkimRecords(options = {}) {
  const { provider, domain = '', userPublicKey = '' } = options;
  if (!provider) return [];
  if (provider.dkim.type === 'manual') return [];

  const safeDomain = domain || 'yourdomain.com';
  const cleanKey = userPublicKey ? userPublicKey.replace(/\s+/g, '') : '';

  return provider.dkim.records.map((rec) => {
    let value = rec.value;
    let status = rec.status || 'provider_generated';
    let note = rec.note;
    let chunks = 1;

    if (rec.valueFn) {
      value = rec.valueFn(safeDomain);
      status = 'ready';
    }

    if (rec.type === 'TXT' && cleanKey && provider.dkim.type === 'txt') {
      const chunked = chunkDkimValue(cleanKey);
      value = chunked.value;
      chunks = chunked.chunks;
      status = 'ready';
      note = chunked.needsChunking
        ? `Key split into ${chunks} strings of up to 255 characters each per RFC 6376. DNS panels accept this concatenated format.`
        : `Key fits in a single TXT string. Paste the value above as-is.`;
    }

    return { host: rec.host, type: rec.type, value, note, status, chunks };
  });
}

/**
 * Build MX records for a provider, resolving any valueFn hosts with the
 * current domain.
 */
export function buildMxRecords(options = {}) {
  const { provider, domain = '' } = options;
  if (!provider || !provider.mx) return { records: [], note: null };
  const safeDomain = domain || 'yourdomain.com';
  const records = provider.mx.map((mx) => ({
    priority: mx.priority,
    host: typeof mx.host === 'function' ? mx.host(safeDomain) : mx.host,
  }));
  return { records, note: provider.mxNote || null };
}

/**
 * Build a BIMI record + emit the requirements as warnings.
 *
 * Arguments:
 *   logoUrl      https URL ending in .svg
 *   vmcUrl       optional https URL to a VMC certificate (.pem)
 *   selector     defaults to 'default'
 *   dmarcPolicy  the current DMARC policy (to validate enforcement)
 *   dmarcPct     the current DMARC pct (to validate full coverage)
 */
export function buildBimiRecord(options = {}) {
  const {
    logoUrl = '',
    vmcUrl = '',
    selector = 'default',
    dmarcPolicy = 'none',
    dmarcPct = 100,
  } = options;

  const host = `${selector}._bimi`;
  const tags = ['v=BIMI1'];
  if (logoUrl) tags.push(`l=${logoUrl}`);
  else tags.push('l=');
  if (vmcUrl) tags.push(`a=${vmcUrl}`);
  const record = tags.join('; ');

  const warnings = [];

  if (dmarcPolicy === 'none') {
    warnings.push({
      level: 'critical',
      code: 'BIMI_REQUIRES_ENFORCEMENT',
      message: 'BIMI requires DMARC p=quarantine or p=reject with pct=100. Mailbox providers ignore BIMI records under p=none.',
      fix: 'Move DMARC to p=quarantine at pct=100, then add BIMI.',
    });
  } else if (dmarcPct < 100) {
    warnings.push({
      level: 'critical',
      code: 'BIMI_REQUIRES_FULL_PCT',
      message: `BIMI requires DMARC pct=100. Yours is pct=${dmarcPct}.`,
      fix: 'Set DMARC pct to 100 before adding BIMI.',
    });
  }

  if (!logoUrl) {
    warnings.push({
      level: 'critical',
      code: 'BIMI_NO_LOGO',
      message: 'BIMI requires a logo URL pointing to an SVG Tiny P/S file.',
    });
  } else {
    const logoCheck = validateBimiLogoUrl(logoUrl);
    if (!logoCheck.valid) {
      warnings.push({
        level: 'warning',
        code: 'BIMI_LOGO_URL',
        message: logoCheck.error,
      });
    }
  }

  if (!vmcUrl) {
    warnings.push({
      level: 'info',
      code: 'BIMI_NO_VMC',
      message: 'Gmail and Yahoo require a Verified Mark Certificate to display the logo in the inbox. Without a VMC, the record is valid but most inboxes will ignore it.',
    });
  }

  return { record, host, tags, warnings };
}

/**
 * Build the MTA-STS record bundle:
 *   - _mta-sts TXT record (policy version pointer)
 *   - the policy file content + where to host it
 *   - optional TLS reporting TXT record
 *
 * mode is one of:
 *   'testing'  monitor only; receivers log failures but still deliver
 *   'enforce'  receivers refuse delivery on TLS failure
 *   'none'     policy is effectively disabled (used to remove MTA-STS)
 *
 * maxAge is in seconds. Common values: 604800 (1 week), 2592000 (30 days).
 * The RFC recommends at least 86400 (1 day) and typically a week or more.
 */
export function buildMtaStsRecords(options = {}) {
  const {
    mode = 'testing',
    maxAge = 604800,
    tlsReportEmail = '',
    domain = '',
    provider,
    policyId,
  } = options;

  const safeDomain = domain || 'yourdomain.com';
  // policyId must change whenever the policy file changes. We use an ISO date
  // when one isn't supplied, so the caller can pin it deterministically for
  // display/snapshot tests.
  const id = policyId || new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  const txtRecord = {
    host: '_mta-sts',
    type: 'TXT',
    value: `v=STSv1; id=${id}`,
  };

  const mxHosts = (provider?.mx || []).map((mx) =>
    typeof mx.host === 'function' ? mx.host(safeDomain) : mx.host
  );

  const policyLines = [
    'version: STSv1',
    `mode: ${mode}`,
    ...mxHosts.map((h) => `mx: ${h}`),
    `max_age: ${maxAge}`,
  ];
  if (mxHosts.length === 0) {
    policyLines.splice(2, 0, 'mx: mail.yourdomain.com');
  }

  const policyFile = {
    filename: 'mta-sts.txt',
    path: `/.well-known/mta-sts.txt`,
    url: `https://mta-sts.${safeDomain}/.well-known/mta-sts.txt`,
    content: policyLines.join('\n'),
  };

  const subdomainRecord = {
    host: 'mta-sts',
    type: 'A or CNAME',
    value: 'Point to the web host that will serve the policy file',
    note: `The mta-sts.${safeDomain} subdomain must serve the policy file over HTTPS with a valid certificate for the hostname mta-sts.${safeDomain}.`,
  };

  const tlsReporting =
    (tlsReportEmail || '').trim()
      ? {
          host: '_smtp._tls',
          type: 'TXT',
          value: `v=TLSRPTv1; rua=mailto:${tlsReportEmail.trim()}`,
          note: 'Receives TLS error reports from supporting mailbox providers. Strongly recommended.',
        }
      : null;

  const warnings = [];
  if (mode === 'enforce') {
    warnings.push({
      level: 'warning',
      code: 'MTASTS_ENFORCE_MODE',
      message: 'Enforce mode blocks mail delivery on TLS failure. Stay in testing mode for at least a week, read the TLS reports, and only switch to enforce once there are zero failures.',
    });
  }
  if (maxAge < 86400) {
    warnings.push({
      level: 'warning',
      code: 'MTASTS_SHORT_MAX_AGE',
      message: 'max_age below 1 day is unusually low. RFC 8461 recommends at least 1 day and typically 1 week.',
    });
  }
  if (!(tlsReportEmail || '').trim()) {
    warnings.push({
      level: 'info',
      code: 'MTASTS_NO_TLS_REPORTING',
      message: 'Without TLS reporting you will not see TLS failures. Add a reporting email to enable _smtp._tls.',
    });
  }

  return { txtRecord, subdomainRecord, policyFile, tlsReporting, warnings, id };
}

/**
 * Formatting hint for a registrar's DNS panel. Some panels auto-wrap TXT
 * values in quotes, some don't. Rendering this hint next to the value keeps
 * users from double-quoting (or mis-unquoting) their records.
 */
export function registrarFormattingHint(registrarId) {
  const r = REGISTRARS.find((x) => x.id === registrarId);
  if (!r) return null;
  switch (r.quoting) {
    case 'unquoted':
      return 'Paste the value without quotes. Cloudflare adds the quoting automatically.';
    case 'auto_wrapped':
      return `${r.name} wraps the value in quotes for you. Paste the raw value as shown.`;
    default:
      return 'Paste the value as shown. If your provider requires quotes, wrap the entire value in a single pair.';
  }
}
