/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/jobs/:jobId/results

   Stream the job's results in one of three formats. Type-aware: column
   shapes differ for email vs phone jobs.

   ─── Format dispatch ───
     ?json=1                    application/json with {items:[...]}
     ?format=txt                text/plain, one value per line
     (default)                  text/csv with full classification fields

   ─── Filter ───
     ?clean=1                   only the deliverable rows
                                  email: category='valid'
                                  phone: subcategory='mobile'

   ─── Format combinations ───
     default               CSV, full
     ?clean=1              CSV, deliverable only
     ?format=txt           TXT, all (one number/email per line)
     ?format=txt&clean=1   TXT, deliverable only - the SMS-paste list
     ?json=1               JSON, full classification (for the UI)
     ?json=1&clean=1       JSON, deliverable only

   ─── Why TXT mode ───
   Non-technical users running on phone or in apps without spreadsheet
   software need a plain-text list they can paste into an SMS sender,
   email client, or messaging tool. TXT is the universal format -
   opens in any text editor, any browser, any mobile app.

   ─── Why JSON mode ───
   The UI's results panel renders a sortable filterable table. Pulling
   JSON once at finalize is much cheaper than parsing CSV in the
   browser, and matches the shape the UI's component expects.

   Job must be in a terminal state (complete, partial, cancelled, failed)
   to download. While processing, returns 409 Conflict.

   Auth: required, ownership enforced.
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser }     from '~/utils/session.server';
import { getJobForUser }   from '~/lib/jobQueue.server';
import { sql }             from '~/utils/db.server';

const TERMINAL_STATES = new Set(['complete', 'partial', 'cancelled', 'failed']);

export async function loader({ request, params }) {
  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId is required' },
      { status: 400 },
    );
  }

  const job = await getJobForUser(jobId, user.id);
  if (!job) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', error: 'Job not found' },
      { status: 404 },
    );
  }

  if (!TERMINAL_STATES.has(job.status)) {
    return Response.json(
      {
        ok:           false,
        code:         'JOB_NOT_TERMINAL',
        error:        'Job has not finished yet',
        currentStatus: job.status,
      },
      { status: 409 },
    );
  }

  const url = new URL(request.url);
  const cleanOnly = url.searchParams.get('clean') === '1';
  const wantJson  = url.searchParams.get('json') === '1';
  const wantTxt   = url.searchParams.get('format') === 'txt';

  // ─── Fetch items based on type + clean filter ───
  const items = job.type === 'phone'
    ? await fetchPhoneItems(jobId, cleanOnly)
    : await fetchEmailItems(jobId, cleanOnly);

  // ─── JSON mode (powers the UI) ───
  if (wantJson) {
    return Response.json(
      {
        ok:     true,
        jobId:  job.id,
        type:   job.type,
        status: job.status,
        total:  items.length,
        items,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  // ─── TXT mode (paste-friendly plain list) ───
  if (wantTxt) {
    const txt = buildTxt(items, job.type);
    const flavor = cleanOnly
      ? (job.type === 'phone' ? 'mobile' : 'clean')
      : 'all';
    const filename = `${flavor}-${job.type}-${jobId.slice(0, 8)}.txt`;
    return new Response(txt, {
      headers: {
        'Content-Type':        'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  }

  // ─── CSV mode (default) ───
  const csv = job.type === 'phone'
    ? buildPhoneCsv(items, cleanOnly)
    : buildEmailCsv(items, cleanOnly);

  const flavor = cleanOnly ? 'clean' : 'results';
  const filename = `${flavor}-${job.type}-${jobId.slice(0, 8)}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}

// =========================================================================
// Item fetchers (one per type)
// =========================================================================

async function fetchEmailItems(jobId, cleanOnly) {
  if (cleanOnly) {
    const rows = await sql`
      SELECT row_index AS "rowIndex", input AS email
      FROM verification_job_items
      WHERE job_id = ${jobId}
        AND status = 'done'
        AND category = 'valid'
      ORDER BY row_index
    `;
    return rows;
  }
  const rows = await sql`
    SELECT row_index    AS "rowIndex",
           input        AS email,
           status,
           category,
           subcategory,
           smtp_response AS "smtpResponse",
           error_code    AS "errorCode"
    FROM verification_job_items
    WHERE job_id = ${jobId}
    ORDER BY row_index
  `;
  return rows;
}

async function fetchPhoneItems(jobId, cleanOnly) {
  if (cleanOnly) {
    const rows = await sql`
      SELECT row_index                          AS "rowIndex",
             COALESCE(result->>'e164', input)   AS e164
      FROM verification_job_items
      WHERE job_id = ${jobId}
        AND status = 'done'
        AND category = 'valid'
        AND subcategory = 'mobile'
      ORDER BY row_index
    `;
    return rows;
  }
  const rows = await sql`
    SELECT row_index AS "rowIndex",
           input,
           status,
           category,
           subcategory,
           error_code AS "errorCode",
           result->>'e164'                                  AS e164,
           result->>'lineType'                              AS "lineType",
           result->>'lineTypeLabel'                         AS "lineTypeLabel",
           result->>'carrier'                               AS carrier,
           (result->>'smsCapable')::boolean                 AS "smsCapable",
           COALESCE(
             result->'formatResult'->>'country',
             result->'partial'->>'country'
           )                                                AS country
    FROM verification_job_items
    WHERE job_id = ${jobId}
    ORDER BY row_index
  `;
  return rows;
}

// =========================================================================
// CSV builders
// =========================================================================

function buildEmailCsv(items, cleanOnly) {
  if (cleanOnly) {
    const header = 'email\n';
    if (items.length === 0) return header;
    return header + items.map((i) => csvEscape(i.email)).join('\n') + '\n';
  }
  const header = 'email,status,category,subcategory,smtp_response,error_code\n';
  if (items.length === 0) return header;
  const rows = items.map((i) =>
    [
      csvEscape(i.email),
      csvEscape(i.status),
      csvEscape(i.category),
      csvEscape(i.subcategory),
      csvEscape(i.smtpResponse),
      csvEscape(i.errorCode),
    ].join(','),
  );
  return header + rows.join('\n') + '\n';
}

function buildPhoneCsv(items, cleanOnly) {
  if (cleanOnly) {
    const header = 'number\n';
    if (items.length === 0) return header;
    return header + items.map((i) => csvEscape(i.e164)).join('\n') + '\n';
  }
  const header = 'number,e164,country,status,category,subcategory,line_type,line_type_label,carrier,sms_capable,error_code\n';
  if (items.length === 0) return header;
  const rows = items.map((i) =>
    [
      csvEscape(i.input),
      csvEscape(i.e164),
      csvEscape(i.country),
      csvEscape(i.status),
      csvEscape(i.category),
      csvEscape(i.subcategory),
      csvEscape(i.lineType),
      csvEscape(i.lineTypeLabel),
      csvEscape(i.carrier),
      i.smsCapable === true ? 'Y' : i.smsCapable === false ? 'N' : '',
      csvEscape(i.errorCode),
    ].join(','),
  );
  return header + rows.join('\n') + '\n';
}

// =========================================================================
// TXT builder (universal plain list)
// =========================================================================

function buildTxt(items, type) {
  if (items.length === 0) return '';
  // For phone: prefer e164 (normalized); fall back to raw input.
  // For email: just the email.
  const lines = items.map((i) => {
    if (type === 'phone') return i.e164 || i.input || '';
    return i.email || '';
  }).filter(Boolean);
  return lines.join('\n') + '\n';
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * RFC 4180 escape: wrap in double quotes if the value contains comma,
 * double quote, CR, or LF; double-up any internal double quotes.
 */
function csvEscape(val) {
  if (val == null) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
