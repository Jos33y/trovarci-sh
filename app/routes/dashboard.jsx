import { useState, useMemo, useEffect } from 'react';
import { Link, Form, useLoaderData, useFetcher, useNavigate } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import { listTransactions, getCreditSummary } from '~/lib/credits.server';
import { listJobsForUser } from '~/lib/jobQueue.server';
import { isEmailOnWaitlist } from '~/lib/waitlist.server';
import { LOW_BALANCE_THRESHOLD } from '~/utils/creditsConfig.server';
import styles from '~/styles/modules/routes/dashboard';

export const meta = () => [
  { title: 'Dashboard | Trovarcis Reach' },
  { name: 'description', content: 'Manage your credits, view verification history, and access tools.' },
  { name: 'robots', content: 'noindex' },
];

/* SHAPERS - DB rows -> view models */

function shapeTransaction(row) {
  const isIncoming = row.delta > 0;
  const amount = (isIncoming ? '+' : '') + row.delta.toLocaleString();

  let label = 'Transaction';
  let method = '';
  let price = '';

  const meta = row.metadata || {};

  if (row.type === 'purchase') {
    label  = meta.package_name || `Credit purchase (${row.delta.toLocaleString()})`;
    method = meta.payment_method || 'Stripe';
    if (meta.amount_usd) price = `-$${Number(meta.amount_usd).toFixed(2)}`;
  } else if (row.type === 'grant') {
    label  = meta.source === 'welcome_bonus' ? 'Welcome bonus' : 'Credit grant';
  } else if (row.type === 'refund') {
    label  = meta.reason ? `Refund: ${meta.reason}` : 'Refund';
  } else if (row.type === 'usage') {
    const tool = meta.tool || 'usage';
    const count = meta.count;
    const prettyTool = {
      email_verify:  'Email verification',
      email_score:   'Email Scorer',
      phone_verify:  'Phone lookup',
      domain_check:  'Domain check',
      smtp_test:     'SMTP test',
      dns_generate:  'DNS Generator',
    }[tool] || tool;
    label  = count ? `${prettyTool} (${count.toLocaleString()})` : prettyTool;
  } else if (row.type === 'adjustment') {
    label  = meta.reason || 'Admin adjustment';
    method = 'Admin';
  }

  return {
    id: row.id,
    label,
    date: new Date(row.created_at).toISOString().slice(0, 10),
    method,
    // Real DB type. Five values: 'purchase' | 'usage' | 'refund' | 'grant' |
    // 'adjustment'. Each renders with its own pill color in the UI.
    type: row.type,
    // Direction is derived from the sign of delta and drives the AMOUNT
    // colour (green for credits-in, red for credits-out). Direction is NOT
    // type - a refund and a purchase are both "in" but they're different
    // events.
    direction: isIncoming ? 'in' : 'out',
    amount,
    price,
  };
}

function shapeJob(row) {
  const meta = row.metadata || {};
  const typeLabel = row.type === 'phone' ? 'Phone lookup' : 'Email verification';

  let detail;
  if (meta.filename) {
    detail = String(meta.filename);
  } else {
    const units = row.type === 'phone' ? 'numbers' : 'addresses';
    detail = `${row.totalRows.toLocaleString()} ${units}`;
  }

  let uiStatus;
  if (row.status === 'cancelled')                                 uiStatus = 'cancelled';
  else if (row.status === 'complete' || row.status === 'partial') uiStatus = 'done';
  else                                                            uiStatus = 'running';

  const denominator = row.processedRows;
  const rate = denominator > 0
    ? Math.round((row.validCount / denominator) * 1000) / 10
    : null;

  return {
    id: row.id,
    type: typeLabel,
    typeKey: row.type,
    detail,
    count: row.totalRows,
    valid: uiStatus === 'running' ? null : row.validCount,
    rate:  uiStatus === 'running' ? null : rate,
    status: uiStatus,
    rawStatus: row.status,
    date: new Date(row.createdAt).toISOString().slice(0, 10),
    credits: row.creditsHeld,
    errorCount: row.errorCount,
  };
}

export async function loader({ request }) {
  const user = await requireUser(request);

  const [txResult, summary, jobRows, onWaitlist] = await Promise.all([
    listTransactions(user.id, { limit: 500, offset: 0 }),
    getCreditSummary(user.id),
    listJobsForUser(user.id, { limit: 100 }),
    isEmailOnWaitlist(user.email),
  ]);

  return {
    user,
    transactions: txResult.rows.map(shapeTransaction),
    summary,
    jobs: jobRows.map(shapeJob),
    onWaitlist,
    lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
  };
}

/* ICONS */

function CreditIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v10M9.5 9.5C9.5 8.4 10.6 7 12 7s2.5 1.2 2.5 2.5c0 2.5-5 2.5-5 5C9.5 16 10.7 17 12 17s2.5-1.2 2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function JobsIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function RateIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 17l4-4 4 4 4-6 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function TotalIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function GaugeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 12l-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}
function GlobeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3c0 0-4 4-4 9s4 9 4 9M12 3c0 0 4 4 4 9s-4 9-4 9M3 12h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function VerifyIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 12l2 2 4-4M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PhoneIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}
function DnsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="20" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="20" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="17" width="20" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="5.5" r="1" fill="currentColor" />
      <circle cx="18" cy="12.5" r="1" fill="currentColor" />
      <circle cx="18" cy="19.5" r="1" fill="currentColor" />
    </svg>
  );
}
function TerminalIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 9l3 3-3 3M13 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckSmallIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function XSmallIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}
function ChevronRightIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}
function SpinnerIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}
function MiniWindowsIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 5.5L11 4v7.5H3V5.5Z" fill="currentColor" />
      <path d="M12 3.8L21 2.5v9H12V3.8Z" fill="currentColor" />
      <path d="M3 12.5h8V20L3 18.5v-6Z" fill="currentColor" />
      <path d="M12 12.5h9v9L12 20.2v-7.7Z" fill="currentColor" />
    </svg>
  );
}
function MiniAppleIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.27.06 2.15.69 2.92.69.78 0 2.23-.85 3.74-.72 1.62.14 2.83.84 3.6 2.17-3.27 1.97-2.73 6.34.74 7.52zm-3.23-14c.07 1.62-1.26 2.98-2.73 3.11-.19-1.58 1.23-3.03 2.73-3.11z" fill="currentColor" />
    </svg>
  );
}
function MiniLinuxIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2C8.5 2 6 5 6 8c0 1.5.5 3 1.3 4.2-.3.8-.5 1.6-.5 2.4 0 1.7.8 3.2 2 4.2-.5.3-.8.8-.8 1.4 0 .9.8 1.8 2 1.8h4c1.2 0 2-.9 2-1.8 0-.6-.3-1.1-.8-1.4 1.2-1 2-2.5 2-4.2 0-.8-.2-1.6-.5-2.4C18.5 11 19 9.5 19 8c0-3-2.5-6-7-6zm-1.5 9.5c-.6 0-1-.5-1-1 0-.6.4-1 1-1s1 .4 1 1c0 .5-.4 1-1 1zm3 0c-.6 0-1-.5-1-1 0-.6.4-1 1-1s1 .4 1 1c0 .5-.4 1-1 1z" fill="currentColor" />
    </svg>
  );
}

/* STATIC CONFIG */

const QUICK_TOOLS = [
  { label: 'Email Scorer',    href: '/score',         icon: GaugeIcon,    free: false },
  { label: 'Domain Checker',  href: '/domain',        icon: GlobeIcon,    free: true  },
  { label: 'Email Verifier',  href: '/verify',        icon: VerifyIcon,   free: false },
  { label: 'Number Verifier', href: '/verify-number', icon: PhoneIcon,    free: false },
  { label: 'DNS Generator',   href: '/records',       icon: DnsIcon,      free: true  },
  { label: 'SMTP Tester',     href: '/smtp-test',     icon: TerminalIcon, free: true  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

const JOB_TYPE_OPTIONS = [
  { value: 'all',   label: 'All types'          },
  { value: 'email', label: 'Email verification' },
  { value: 'phone', label: 'Phone lookup'       },
];

const JOB_STATUS_PILLS = [
  { value: 'all',       label: 'All'       },
  { value: 'running',   label: 'Running'   },
  { value: 'done',      label: 'Done'      },
  { value: 'cancelled', label: 'Cancelled' },
];

const TX_METHOD_OPTIONS = [
  { value: 'all',       label: 'All methods'},
  { value: 'Stripe',    label: 'Stripe'     },
  { value: 'Cryptomus', label: 'Cryptomus'  },
  { value: 'Used',      label: 'Credit use' },
];

const DATE_OPTIONS = [
  { value: 'all', label: 'All time'    },
  { value: '7',   label: 'Last 7 days' },
  { value: '30',  label: 'Last 30 days'},
  { value: '90',  label: 'Last 90 days'},
];

// Display labels for the row pill. Renders one word - the existing layout
// has a tight visual budget for this column.
const TX_TYPE_LABEL = {
  purchase:   'Purchase',
  usage:      'Usage',
  refund:     'Refund',
  grant:      'Grant',
  adjustment: 'Adjustment',
};

// Pill colour resolver. Keeps the 5 type-specific class names in one place
// so the JSX stays readable.
function txTypeClass(type, styles) {
  switch (type) {
    case 'purchase':   return styles.txTypePurchase;
    case 'usage':      return styles.txTypeUsage;
    case 'refund':     return styles.txTypeRefund;
    case 'grant':      return styles.txTypeGrant;
    case 'adjustment': return styles.txTypeAdjustment;
    default:           return styles.txTypeAdjustment;
  }
}

/* HELPERS */

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysSince(d) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

/* Compact page-number window. Returns [1, 2, '...', 6, '...', 12]-style array. */
function getPageWindow(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set([1, total, current, current - 1, current + 1, 2, total - 1]);
  const sorted = [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  // Trim to ~7 visible by dropping 2 / total-1 if they aren't adjacent
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

/* COMPONENT */

export default function DashboardPage() {
  const { user, transactions, jobs, onWaitlist, lowBalanceThreshold } = useLoaderData();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('jobs');

  /* job filters */
  const [jobSearch,   setJobSearch]   = useState('');
  const [jobType,     setJobType]     = useState('all');
  const [jobStatus,   setJobStatus]   = useState('all');
  const [jobDate,     setJobDate]     = useState('all');
  const [jobPage,     setJobPage]     = useState(1);
  const [jobPageSize, setJobPageSize] = useState(DEFAULT_PAGE_SIZE);

  /* transaction filters */
  const [txSearch,   setTxSearch]   = useState('');
  const [txFilter,   setTxFilter]   = useState('all');
  const [txMethod,   setTxMethod]   = useState('all');
  const [txDate,     setTxDate]     = useState('all');
  const [txPage,     setTxPage]     = useState(1);
  const [txPageSize, setTxPageSize] = useState(DEFAULT_PAGE_SIZE);

  /* Filter jobs */
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (jobSearch) {
        const q = jobSearch.toLowerCase();
        if (!j.type.toLowerCase().includes(q) && !j.detail.toLowerCase().includes(q)) return false;
      }
      if (jobType   !== 'all' && j.typeKey !== jobType)   return false;
      if (jobStatus !== 'all' && j.status  !== jobStatus) return false;
      if (jobDate   !== 'all' && daysSince(j.date) > parseInt(jobDate, 10)) return false;
      return true;
    });
  }, [jobs, jobSearch, jobType, jobStatus, jobDate]);

  /* Filter transactions */
  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      if (txSearch) {
        const q = txSearch.toLowerCase();
        if (!t.label.toLowerCase().includes(q) && !t.method.toLowerCase().includes(q)) return false;
      }
      if (txFilter !== 'all' && t.type !== txFilter) return false;
      if (txMethod !== 'all' && t.method !== txMethod) return false;
      if (txDate   !== 'all' && daysSince(t.date) > parseInt(txDate, 10)) return false;
      return true;
    });
  }, [transactions, txSearch, txFilter, txMethod, txDate]);

  /* Pagination */
  const jobTotalPages = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize));
  const jobSafePage   = Math.min(jobPage, jobTotalPages);
  const pagedJobs     = filteredJobs.slice((jobSafePage - 1) * jobPageSize, jobSafePage * jobPageSize);

  const txTotalPages = Math.max(1, Math.ceil(filteredTx.length / txPageSize));
  const txSafePage   = Math.min(txPage, txTotalPages);
  const pagedTx      = filteredTx.slice((txSafePage - 1) * txPageSize, txSafePage * txPageSize);

  const jobPageWindow = useMemo(() => getPageWindow(jobSafePage, jobTotalPages), [jobSafePage, jobTotalPages]);
  const txPageWindow  = useMemo(() => getPageWindow(txSafePage,  txTotalPages),  [txSafePage,  txTotalPages]);

  /* Stats */
  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const cancelled = jobs.filter(j => j.status === 'cancelled').length;
    const ratedJobs = jobs.filter(j => j.status === 'done' && j.rate !== null);
    const avgRate   = ratedJobs.length
      ? (ratedJobs.reduce((s, j) => s + j.rate, 0) / ratedJobs.length).toFixed(1)
      : '0.0';
    const totalVerified = jobs
      .filter(j => j.status === 'done')
      .reduce((s, j) => s + (j.valid || 0), 0);
    return { totalJobs, cancelled, avgRate, totalVerified };
  }, [jobs]);

  // Three-tier balance status: empty (red) / low (gold) / healthy (green).
  const balanceStatus = (() => {
    if (user.creditsBalance <= 0)               return { type: 'error',  label: 'Empty' };
    if (user.creditsBalance < lowBalanceThreshold) return { type: 'accent', label: 'Low' };
    return { type: 'ok', label: 'Healthy' };
  })();

  const jobFiltersActive = jobSearch || jobType !== 'all' || jobStatus !== 'all' || jobDate !== 'all';
  const txFiltersActive  = txSearch || txFilter !== 'all' || txMethod !== 'all' || txDate !== 'all';

  function resetJobFilters() {
    setJobSearch(''); setJobType('all'); setJobStatus('all'); setJobDate('all'); setJobPage(1);
  }
  function resetTxFilters() {
    setTxSearch(''); setTxFilter('all'); setTxMethod('all'); setTxDate('all'); setTxPage(1);
  }

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Dashboard</h1>
              <p className={styles.pageEmail}>{user.email}</p>
            </div>
            <Link to="/credits" className={styles.buyBtn}>Buy credits</Link>
          </div>

          {/* ── 4 Stats cards ── */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard} data-accent="gold">
              <div className={styles.statTop}>
                <div className={styles.statIconWrap} data-color="gold"><CreditIcon size={17} /></div>
                <span className={styles.statBadge} data-type={balanceStatus.type}>{balanceStatus.label}</span>
              </div>
              <div className={styles.statValue}>{user.creditsBalance.toLocaleString()}</div>
              <div className={styles.statLabel}>Credits remaining</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statTop}>
                <div className={styles.statIconWrap} data-color="neutral"><JobsIcon size={17} /></div>
                <span className={styles.statBadge} data-type={stats.cancelled > 0 ? 'warn' : 'ok'}>
                  {stats.cancelled > 0 ? `${stats.cancelled} cancelled` : 'All clear'}
                </span>
              </div>
              <div className={styles.statValue}>{stats.totalJobs}</div>
              <div className={styles.statLabel}>Bulk jobs run</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statTop}>
                <div className={styles.statIconWrap} data-color="success"><RateIcon size={17} /></div>
                <span className={styles.statBadge} data-type="ok">Healthy</span>
              </div>
              <div className={styles.statValue}>{stats.avgRate}%</div>
              <div className={styles.statLabel}>Avg valid rate</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statTop}>
                <div className={styles.statIconWrap} data-color="neutral"><TotalIcon size={17} /></div>
                <span className={styles.statSub}>across all jobs</span>
              </div>
              <div className={styles.statValue}>{stats.totalVerified.toLocaleString()}</div>
              <div className={styles.statLabel}>Records verified</div>
            </div>
          </div>

          {/* ── Mid row: Desktop waitlist panel + Quick tools ── */}
          <div className={styles.midGrid}>
            <DesktopWaitlistPanel userEmail={user.email} onWaitlist={onWaitlist} />

            <div className={styles.toolsCard}>
              <div className={styles.toolsTitle}>Quick access</div>
              <div className={styles.toolsGrid}>
                {QUICK_TOOLS.map(({ label, href, icon: Icon, free }) => (
                  <Link key={href} to={href} className={styles.toolCell}>
                    <span className={styles.toolCellIcon}><Icon size={15} /></span>
                    <span className={styles.toolCellLabel}>{label}</span>
                    {free && <span className={styles.toolFreeBadge}>Free</span>}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── History panel ── */}
          <div className={styles.panel}>

            <div className={styles.panelTabs} role="tablist" aria-label="History">
              <button
                role="tab"
                aria-selected={activeTab === 'jobs'}
                aria-controls="panel-jobs"
                id="tab-jobs"
                className={activeTab === 'jobs' ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab('jobs')}
              >
                Bulk jobs<span className={styles.tabBadge}>{jobs.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'transactions'}
                aria-controls="panel-transactions"
                id="tab-transactions"
                className={activeTab === 'transactions' ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab('transactions')}
              >
                Transactions<span className={styles.tabBadge}>{transactions.length}</span>
              </button>
            </div>
            {activeTab === 'jobs' && (
              <div role="tabpanel" id="panel-jobs" aria-labelledby="tab-jobs">
                <div className={styles.toolbar}>
                  <div className={styles.searchBox}>
                    <span className={styles.searchIcon}><SearchIcon size={14} /></span>
                    <input
                      className={styles.searchInput}
                      type="text"
                      placeholder="Search by type or input..."
                      value={jobSearch}
                      onChange={(e) => { setJobSearch(e.target.value); setJobPage(1); }}
                      aria-label="Search jobs"
                    />
                    {jobSearch && (
                      <button className={styles.clearBtn} onClick={() => { setJobSearch(''); setJobPage(1); }} aria-label="Clear search">
                        <XSmallIcon size={12} />
                      </button>
                    )}
                  </div>

                  <div className={styles.filters}>
                    <div className={styles.statusPills} role="group" aria-label="Filter by status">
                      {JOB_STATUS_PILLS.map(({ value, label }) => {
                        const selected = jobStatus === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            className={selected ? styles.pillOn : styles.pill}
                            onClick={() => { setJobStatus(value); setJobPage(1); }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <select className={styles.filterSelect} value={jobType} onChange={(e) => { setJobType(e.target.value); setJobPage(1); }} aria-label="Filter by type">
                      {JOB_TYPE_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select className={styles.filterSelect} value={jobDate} onChange={(e) => { setJobDate(e.target.value); setJobPage(1); }} aria-label="Filter by date">
                      {DATE_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {jobFiltersActive && (
                  <div className={styles.resultsBar} role="status" aria-live="polite">
                    {filteredJobs.length} result{filteredJobs.length !== 1 ? 's' : ''}
                    <button className={styles.resetFilters} onClick={resetJobFilters}>Clear filters</button>
                  </div>
                )}

                {pagedJobs.length > 0 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Type</th>
                          <th scope="col">Input</th>
                          <th scope="col" className={styles.thR}>Count</th>
                          <th scope="col" className={styles.thR}>Valid</th>
                          <th scope="col" className={styles.thR}>Rate</th>
                          <th scope="col" className={styles.thR}>Credits</th>
                          <th scope="col">Date</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedJobs.map((job) => (
                          <tr
                            key={job.id}
                            className={styles.rowClickable}
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(`/jobs/${job.id}`);
                              }
                            }}
                            role="link"
                            tabIndex={0}
                            aria-label={`View job: ${job.type} - ${job.detail}`}
                          >
                            <td><span className={styles.typePill}>{job.type}</span></td>
                            <td className={styles.tdDetail} title={job.detail}>{job.detail}</td>
                            <td className={styles.tdR}>{job.count.toLocaleString()}</td>
                            <td className={styles.tdR}>
                              {job.valid !== null ? job.valid.toLocaleString() : <span className={styles.tdDash} aria-label="not available">-</span>}
                            </td>
                            <td className={styles.tdR}>
                              {job.rate !== null
                                ? <span className={job.rate >= 90 ? styles.rateGood : job.rate >= 75 ? styles.rateOk : styles.rateBad}>{job.rate}%</span>
                                : <span className={styles.tdDash} aria-label="not available">-</span>}
                            </td>
                            <td className={styles.tdR}>
                              {job.credits > 0
                                ? <span className={styles.creditUsed}>-{job.credits.toLocaleString()}</span>
                                : <span className={styles.creditFree}>Free</span>}
                            </td>
                            <td className={styles.tdDate}>{fmtDate(job.date)}</td>
                            <td>
                              {job.status === 'done'      && <span className={styles.statusDone}>     <CheckSmallIcon size={11} />done</span>}
                              {job.status === 'cancelled' && <span className={styles.statusFailed}>   <XSmallIcon     size={11} />cancelled</span>}
                              {job.status === 'running'   && <span className={styles.statusRunning}>  <SpinnerIcon    size={11} />running</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.emptyState} role="status" aria-live="polite">
                    <div className={styles.emptyIcon} aria-hidden="true">
                      <JobsIcon size={28} />
                    </div>
                    <p className={styles.emptyTitle}>
                      {jobs.length === 0 ? 'No bulk jobs yet' : 'No jobs match your filters'}
                    </p>
                    <p className={styles.emptyHelper}>
                      {jobs.length === 0
                        ? 'Upload a CSV on the Email Verifier or Number Verifier to start a bulk job.'
                        : 'Clear filters to see all your jobs.'}
                    </p>
                    {jobs.length === 0 ? (
                      <div className={styles.emptyActions}>
                        <Link to="/verify" className={styles.emptyAction}>Open Email Verifier</Link>
                        <Link to="/verify-number" className={styles.emptyActionGhost}>Open Number Verifier</Link>
                      </div>
                    ) : (
                      <div className={styles.emptyActions}>
                        <button type="button" onClick={resetJobFilters} className={styles.emptyActionGhost}>Clear filters</button>
                      </div>
                    )}
                  </div>
                )}

                <Pager
                  current={jobSafePage}
                  totalPages={jobTotalPages}
                  totalItems={filteredJobs.length}
                  pageSize={jobPageSize}
                  pageWindow={jobPageWindow}
                  onPageChange={setJobPage}
                  onPageSizeChange={(n) => { setJobPageSize(n); setJobPage(1); }}
                  itemNoun="job"
                />
              </div>
            )}
            {activeTab === 'transactions' && (
              <div role="tabpanel" id="panel-transactions" aria-labelledby="tab-transactions">
                <div className={styles.toolbar}>
                  <div className={styles.searchBox}>
                    <span className={styles.searchIcon}><SearchIcon size={14} /></span>
                    <input
                      className={styles.searchInput}
                      type="text"
                      placeholder="Search transactions..."
                      value={txSearch}
                      onChange={(e) => { setTxSearch(e.target.value); setTxPage(1); }}
                      aria-label="Search transactions"
                    />
                    {txSearch && (
                      <button className={styles.clearBtn} onClick={() => { setTxSearch(''); setTxPage(1); }} aria-label="Clear search">
                        <XSmallIcon size={12} />
                      </button>
                    )}
                  </div>

                  <div className={styles.filters}>
                    <div className={styles.statusPills} role="group" aria-label="Filter by type">
                      {[
                        { v: 'all',        l: 'All'        },
                        { v: 'purchase',   l: 'Purchases'  },
                        { v: 'usage',      l: 'Usage'      },
                        { v: 'refund',     l: 'Refunds'    },
                        { v: 'grant',      l: 'Grants'     },
                        { v: 'adjustment', l: 'Adjustments'},
                      ].map(({ v, l }) => {
                        const selected = txFilter === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={selected}
                            className={selected ? styles.pillOn : styles.pill}
                            onClick={() => { setTxFilter(v); setTxPage(1); }}
                          >{l}</button>
                        );
                      })}
                    </div>

                    <select className={styles.filterSelect} value={txMethod} onChange={(e) => { setTxMethod(e.target.value); setTxPage(1); }} aria-label="Filter by method">
                      {TX_METHOD_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select className={styles.filterSelect} value={txDate} onChange={(e) => { setTxDate(e.target.value); setTxPage(1); }} aria-label="Filter by date">
                      {DATE_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>

                    <Form method="post" action="/account/export-transactions" className={styles.exportForm}>
                      <button type="submit" className={styles.exportBtn} title="Download last 12 months as CSV">
                        Export CSV
                      </button>
                    </Form>
                  </div>
                </div>

                {txFiltersActive && (
                  <div className={styles.resultsBar} role="status" aria-live="polite">
                    {filteredTx.length} result{filteredTx.length !== 1 ? 's' : ''}
                    <button className={styles.resetFilters} onClick={resetTxFilters}>Clear filters</button>
                  </div>
                )}

                {pagedTx.length > 0 ? (
                  <div className={styles.txList}>
                    {pagedTx.map((tx) => (
                      <Link
                        key={tx.id}
                        to={`/receipts/${tx.id}`}
                        className={styles.txRow}
                        aria-label={`View receipt for ${tx.label}`}
                      >
                        <div className={styles.txInfo}>
                          <div className={styles.txLabel}>{tx.label}</div>
                          <div className={styles.txMeta}>
                            {fmtDate(tx.date)}{tx.method ? ` via ${tx.method}` : ''}
                          </div>
                        </div>
                        <div className={styles.txRight}>
                          <span className={[styles.txType, txTypeClass(tx.type, styles)].join(' ')}>
                            {TX_TYPE_LABEL[tx.type] || tx.type}
                          </span>
                          <span className={[styles.txAmount, tx.direction === 'in' ? styles.txIn : styles.txOut].join(' ')}>
                            {tx.amount} cr
                          </span>
                          {tx.price && <span className={styles.txPrice}>{tx.price}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState} role="status" aria-live="polite">
                    <div className={styles.emptyIcon} aria-hidden="true">
                      <CreditIcon size={28} />
                    </div>
                    <p className={styles.emptyTitle}>
                      {transactions.length === 0 ? 'No transactions yet' : 'No transactions match your filters'}
                    </p>
                    <p className={styles.emptyHelper}>
                      {transactions.length === 0
                        ? 'Buy credits or run a verification to see activity here.'
                        : 'Clear filters to see all activity.'}
                    </p>
                    {transactions.length === 0 ? (
                      <div className={styles.emptyActions}>
                        <Link to="/credits" className={styles.emptyAction}>Buy credits</Link>
                      </div>
                    ) : (
                      <div className={styles.emptyActions}>
                        <button type="button" onClick={resetTxFilters} className={styles.emptyActionGhost}>Clear filters</button>
                      </div>
                    )}
                  </div>
                )}

                <Pager
                  current={txSafePage}
                  totalPages={txTotalPages}
                  totalItems={filteredTx.length}
                  pageSize={txPageSize}
                  pageWindow={txPageWindow}
                  onPageChange={setTxPage}
                  onPageSizeChange={(n) => { setTxPageSize(n); setTxPage(1); }}
                  itemNoun="transaction"
                />
              </div>
            )}

          </div>{/* end panel */}

        </div>
      </main>
      <Footer />
    </div>
  );
}

/* Sub-component: Pager (per-page selector + compact pagination) */

function Pager({ current, totalPages, totalItems, pageSize, pageWindow, onPageChange, onPageSizeChange, itemNoun }) {
  // Empty list: nothing to count, nothing to page. Rendering "0 jobs Show 10"
  // adds visual noise for no informational gain. Hide the pager entirely
  // and let the empty state own the panel.
  if (totalItems === 0) return null;

  const startIdx = (current - 1) * pageSize + 1;
  const endIdx   = Math.min(current * pageSize, totalItems);

  return (
    <div className={styles.pager}>
      <div className={styles.pagerLeft}>
        <span className={styles.pagerInfo}>
          {`${startIdx}-${endIdx} of ${totalItems} ${itemNoun}${totalItems === 1 ? '' : 's'}`}
        </span>

        <label className={styles.pageSizeLabel}>
          <span className={styles.pageSizeText}>Show</span>
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 && (
        <nav className={styles.pagerBtns} aria-label="Pagination">
          <button
            className={styles.pageArrow}
            onClick={() => onPageChange(Math.max(1, current - 1))}
            disabled={current === 1}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </button>

          {pageWindow.map((p, i) =>
            p === '...' ? (
              <span key={`gap-${i}`} className={styles.pageGap} aria-hidden="true">...</span>
            ) : (
              <button
                key={p}
                className={p === current ? styles.pageNumActive : styles.pageNum}
                onClick={() => onPageChange(p)}
                aria-label={`Go to page ${p}`}
                aria-current={p === current ? 'page' : undefined}
              >
                {p}
              </button>
            )
          )}

          <button
            className={styles.pageArrow}
            onClick={() => onPageChange(Math.min(totalPages, current + 1))}
            disabled={current === totalPages}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </button>
        </nav>
      )}
    </div>
  );
}

/* Sub-component: DesktopWaitlistPanel */

function DesktopWaitlistPanel({ userEmail, onWaitlist }) {
  const fetcher = useFetcher();
  const [email, setEmail] = useState(userEmail);

  // Keep input synced if userEmail changes (shouldn't normally) and reset
  // after a successful submission.
  useEffect(() => {
    if (fetcher.data?.ok) setEmail(userEmail);
  }, [fetcher.data, userEmail]);

  const justSubmitted = fetcher.data?.ok === true;
  const errorMsg      = fetcher.data?.ok === false ? (fetcher.data.error || 'Could not save - try again') : null;
  const loading       = fetcher.state === 'submitting';

  // onWaitlist is the loader-derived "is THIS user's email already on the
  // list?" boolean. justSubmitted covers the same state for "they hit
  // submit just now" - either way, render success.
  const isOnList = onWaitlist || justSubmitted;

  return (
    <div className={styles.desktopPanel}>
      <div className={styles.desktopPanelGlow} aria-hidden="true" />

      <div className={styles.desktopPanelHeader}>
        <div className={styles.desktopPanelTitle}>Trovarcis Reach Desktop</div>
        <span className={styles.desktopPanelTag}>Coming soon</span>
      </div>

      {isOnList ? (
        <div className={styles.desktopSuccess} role="status" aria-live="polite">
          <div className={styles.desktopSuccessIcon}>
            <CheckSmallIcon size={14} />
          </div>
          <div>
            <div className={styles.desktopSuccessTitle}>You're on the list</div>
            <div className={styles.desktopSuccessSub}>We'll email you the moment it ships.</div>
          </div>
        </div>
      ) : (
        <>
          <h2 className={styles.desktopHeadline}>Be first when it ships</h2>
          <p className={styles.desktopSub}>
            One-time purchase. Runs offline. Your contacts never leave your machine.
            Early access list gets a 20% launch discount.
          </p>

          <fetcher.Form method="post" action="/api/waitlist" className={styles.desktopForm}>
            <input type="hidden" name="source" value="dashboard_panel" />
            <label className={styles.desktopInputWrap}>
              <span className={styles.visuallyHidden}>Your email address</span>
              <input
                className={styles.desktopInput}
                name="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-invalid={errorMsg ? 'true' : undefined}
                aria-describedby={errorMsg ? 'desktop-waitlist-error' : undefined}
              />
            </label>
            <button
              type="submit"
              className={styles.desktopSubmit}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? 'Adding...' : 'Notify me'}
            </button>
          </fetcher.Form>

          {errorMsg && (
            <div id="desktop-waitlist-error" className={styles.desktopFormError} role="alert">
              {errorMsg}
            </div>
          )}
        </>
      )}

      <div className={styles.desktopPlatforms} aria-label="Supported platforms">
        <span className={styles.desktopPlatformItem}><MiniWindowsIcon /> Windows</span>
        <span className={styles.desktopPlatformDot} aria-hidden="true">·</span>
        <span className={styles.desktopPlatformItem}><MiniAppleIcon /> macOS</span>
        <span className={styles.desktopPlatformDot} aria-hidden="true">·</span>
        <span className={styles.desktopPlatformItem}><MiniLinuxIcon /> Linux</span>
      </div>
    </div>
  );
}
