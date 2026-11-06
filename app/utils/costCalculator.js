// Bulk email cost calculator. Pure functions, shared by the loader (so the page works
// without JavaScript and every result has a URL) and the browser (live updates).
//
// Prices: monthly billing, US dollars, as published August to October 2026.
// Update PRICES_CHECKED and the tables together when re-checking.

export const PRICES_CHECKED = 'October 2026';

// Mailchimp Standard: billed by contacts. Published tier points; prices between two
// points are estimated on a straight line, and shown as "about".
const MAILCHIMP_STANDARD = [
  [500, 20],
  [2500, 60],
  [5000, 100],
  [10000, 135],
  [25000, 310],
  [50000, 450],
  [100000, 800],
];
const MAILCHIMP_MAX_CONTACTS = 100000;
const MAILCHIMP_SENDS_PER_CONTACT = 12; // monthly send limit is 12 times the contact tier

// Brevo: billed by emails per month. Real tiers, so the price is the first tier that fits.
const BREVO_TIERS = [
  [5000, 9, 'Starter'],
  [10000, 17, 'Starter'],
  [20000, 29, 'Starter'],
  [40000, 39, 'Starter'],
  [60000, 55, 'Starter'],
  [100000, 69, 'Starter'],
  [150000, 169, 'Standard'],
];

// Amazon SES, pay as you go: $0.10 per 1,000 emails.
const SES_PER_THOUSAND = 0.1;

export const MONTHS = 36;
export const CONTACT_LIMITS = { min: 100, max: 1000000 };
export const SEND_OPTIONS = [1, 2, 4, 8, 12];

export function clampInputs(rawContacts, rawSends) {
  let contacts = Math.round(Number(String(rawContacts ?? '').replace(/[^\d]/g, '')));
  if (!Number.isFinite(contacts) || contacts <= 0) contacts = 10000;
  contacts = Math.min(Math.max(contacts, CONTACT_LIMITS.min), CONTACT_LIMITS.max);
  let sends = Number(rawSends);
  if (!SEND_OPTIONS.includes(sends)) sends = 4;
  return { contacts, sends };
}

function mailchimpMonthly(contacts) {
  if (contacts > MAILCHIMP_MAX_CONTACTS) return null;
  if (contacts <= MAILCHIMP_STANDARD[0][0]) return { price: MAILCHIMP_STANDARD[0][1], exact: true };
  for (let i = 1; i < MAILCHIMP_STANDARD.length; i += 1) {
    const [c1, p1] = MAILCHIMP_STANDARD[i];
    if (contacts === c1) return { price: p1, exact: true };
    if (contacts < c1) {
      const [c0, p0] = MAILCHIMP_STANDARD[i - 1];
      return { price: Math.round(p0 + ((contacts - c0) / (c1 - c0)) * (p1 - p0)), exact: false };
    }
  }
  return null;
}

function brevoMonthly(emails) {
  const tier = BREVO_TIERS.find(([limit]) => emails <= limit);
  return tier ? { price: tier[1], plan: tier[2] } : null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{ contacts: number, sends: number, senderPrice: number }} input senderPrice in dollars
 */
export function calculate({ contacts, sends, senderPrice }) {
  const emails = contacts * sends;
  const mc = mailchimpMonthly(contacts);
  const brevo = brevoMonthly(emails);
  const sesMonthly = round2((emails / 1000) * SES_PER_THOUSAND);

  const rows = [
    {
      id: 'mailchimp',
      name: 'Mailchimp Standard',
      model: 'Charged for every contact you keep',
      monthly: mc ? mc.price : null,
      total: mc ? mc.price * MONTHS : null,
      approx: mc ? !mc.exact : false,
      note: !mc
        ? 'Standard stops at 100,000 contacts. Above that, Mailchimp quotes a price.'
        : sends > MAILCHIMP_SENDS_PER_CONTACT
          ? 'Over the Standard plan’s send limit (12 emails per contact a month).'
          : 'Includes the campaign builder, templates and automations.',
    },
    {
      id: 'brevo',
      name: brevo ? `Brevo ${brevo.plan}` : 'Brevo',
      model: 'Charged for the emails you send',
      monthly: brevo ? brevo.price : null,
      total: brevo ? brevo.price * MONTHS : null,
      approx: false,
      note: brevo
        ? 'Includes the campaign builder and templates.'
        : 'Above 150,000 emails a month, Brevo quotes a price.',
    },
    {
      id: 'ses',
      name: 'Amazon SES',
      model: 'Charged per email, $0.10 per 1,000',
      monthly: sesMonthly,
      total: round2(sesMonthly * MONTHS),
      approx: false,
      note: 'Sending only. You build or buy everything else: the list, the campaigns, the reports.',
    },
    {
      id: 'sender-ses',
      name: 'Trovarcis Sender + Amazon SES',
      model: 'Sender once, then SES per email',
      monthly: sesMonthly,
      oneTime: senderPrice,
      total: round2(senderPrice + sesMonthly * MONTHS),
      approx: false,
      ours: true,
      note: 'Sender runs the campaign, checks the list and keeps SES inside its limits.',
    },
    {
      id: 'sender-own',
      name: 'Trovarcis Sender + accounts you have',
      model: 'Sender once, through Gmail, Workspace, Zoho or your server',
      monthly: 0,
      oneTime: senderPrice,
      total: senderPrice,
      approx: false,
      ours: true,
      note: 'Nothing extra, as long as your accounts’ daily limits cover your sending.',
    },
  ];

  const priced = rows.filter((r) => r.total != null);
  const max = Math.max(...priced.map((r) => r.total), 1);
  for (const r of rows) r.share = r.total == null ? 0 : Math.max(r.total / max, 0.004);

  const perDay = Math.ceil(emails / 30);
  const workspaceAccounts = Math.max(1, Math.ceil(perDay / 2000));
  const mailchimpTotal = mc ? mc.price * MONTHS : null;
  const savings = mailchimpTotal != null ? round2(mailchimpTotal - (senderPrice + sesMonthly * MONTHS)) : null;

  return {
    contacts,
    sends,
    emails,
    perDay,
    workspaceAccounts,
    rows,
    savings,
    verifyCost: round2(contacts * 0.01),
  };
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Whole dollars from $100 up; cents below, where they matter.
export function money(n) {
  if (n == null) return '';
  if (n >= 100 || Number.isInteger(n)) return usd0.format(Math.round(n));
  return usd2.format(n);
}

export const count = (n) => new Intl.NumberFormat('en-US').format(n);
