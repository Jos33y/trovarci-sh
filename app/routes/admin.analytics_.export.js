// GET /admin/analytics/export?kind=events|daily&days=N - CSV download of analytics for analysis in a spreadsheet.

import { requireAdmin } from '~/utils/admin.server';
import { sql } from '~/utils/db.server';
import { classifySource } from '~/utils/trafficSource';
import { ANALYTICS_RETENTION_DAYS } from '~/utils/analytics.server';

const MAX_ROWS = 250000;

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Leading = + - @ would run as a formula in Excel or Sheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(header, rows) {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

function csvResponse(filename, body) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function exportEvents(days) {
  const rows = await sql`
    SELECT created_at, event_type, session_hash, user_id, path, referrer_domain,
           utm_source, utm_medium, utm_campaign, country, device_class, metadata
    FROM analytics_events
    WHERE created_at > now() - make_interval(days => ${days})
      AND is_bot = FALSE
    ORDER BY created_at ASC, id ASC
    LIMIT ${MAX_ROWS}
  `;
  const header = [
    'created_at', 'event_type', 'session_hash', 'user_id', 'path', 'referrer_domain',
    'source', 'source_type', 'utm_source', 'utm_medium', 'utm_campaign',
    'country', 'device_class', 'metadata',
  ];
  return toCsv(header, rows.map((r) => {
    // Source describes how a visit arrived, so only pageviews carry it.
    const src = r.event_type === 'pageview' ? classifySource(r.utm_source || r.referrer_domain) : { group: '', kind: '' };
    return [
      r.created_at, r.event_type, r.session_hash, r.user_id, r.path, r.referrer_domain,
      src.group, src.kind, r.utm_source, r.utm_medium, r.utm_campaign,
      r.country, r.device_class, r.metadata,
    ];
  }));
}

async function exportDaily() {
  const rows = await sql`
    SELECT day, dimension, dimension_value, event_count, unique_sessions, unique_users
    FROM analytics_daily
    ORDER BY day ASC, dimension ASC, event_count DESC
    LIMIT ${MAX_ROWS}
  `;
  const header = ['day', 'dimension', 'value', 'events', 'unique_sessions', 'unique_users'];
  return toCsv(header, rows.map((r) => [
    r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day,
    r.dimension, r.dimension_value, r.event_count, r.unique_sessions, r.unique_users,
  ]));
}

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') === 'daily' ? 'daily' : 'events';
  const days = Math.min(ANALYTICS_RETENTION_DAYS, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === 'daily') {
    return csvResponse(`trovarcis-analytics-daily-${stamp}.csv`, await exportDaily());
  }
  return csvResponse(`trovarcis-analytics-events-${days}d-${stamp}.csv`, await exportEvents(days));
}
