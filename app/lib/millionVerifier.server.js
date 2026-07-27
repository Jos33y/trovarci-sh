// MillionVerifier adapter. Real-time verdicts plus bulk file handling, normalized for verifyOneEmail.

const SINGLE_BASE = (process.env.MILLIONVERIFIER_SINGLE_BASE_URL || 'https://api.millionverifier.com').replace(/\/+$/, '');
const BULK_BASE   = (process.env.MILLIONVERIFIER_BULK_BASE_URL   || 'https://bulkapi.millionverifier.com').replace(/\/+$/, '');
const API_KEY     = process.env.MILLIONVERIFIER_API_KEY || '';

// Their range is 2 to 60 seconds. Default 20 is too slow to sit behind a web request.
const TIMEOUT_SEC = clampInt(process.env.MILLIONVERIFIER_TIMEOUT_SEC, 10, 2, 60);

// Our own ceiling on the HTTP call, always above their probe budget.
const HTTP_TIMEOUT_MS = (TIMEOUT_SEC + 5) * 1000;

export const MILLIONVERIFIER_ENABLED =
  process.env.EXTERNAL_VERIFIER_PROVIDER === 'millionverifier' && API_KEY.length > 0;

if (process.env.EXTERNAL_VERIFIER_PROVIDER === 'millionverifier' && !API_KEY) {
  console.warn('[millionVerifier] EXTERNAL_VERIFIER_PROVIDER is set but MILLIONVERIFIER_API_KEY is empty. Falling back to direct SMTP.');
}

// Their published policy is that good and bad are charged, risky is not. Risky means
// catch_all and unknown. Confirm against the first real invoice before trusting it.
const VERDICT_MAP = {
  ok:         { verdict: 'ok',         billable: true  },
  invalid:    { verdict: 'invalid',    billable: true  },
  disposable: { verdict: 'disposable', billable: true  },
  catch_all:  { verdict: 'catch_all',  billable: false },
  unknown:    { verdict: 'unknown',    billable: false },
};

// Verify one address. Returns { ok:true, verdict, billable, raw } or { ok:false, code, error }.
export async function verifyEmailViaMillionVerifier(email, opts = {}) {
  if (!API_KEY) {
    return { ok: false, code: 'MV_NO_API_KEY', error: 'MILLIONVERIFIER_API_KEY is not set' };
  }

  const timeout = clampInt(opts.timeoutSec, TIMEOUT_SEC, 2, 60);
  const url = `${SINGLE_BASE}/api/v3/?api=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(email)}&timeout=${timeout}`;

  const res = await getJson(url, HTTP_TIMEOUT_MS);
  if (!res.ok) return res;

  const body = res.body;

  // Their error field is populated on rejected requests even with HTTP 200.
  if (body && body.error) {
    return { ok: false, code: 'MV_API_ERROR', error: String(body.error).slice(0, 300) };
  }

  const raw = String(body?.result || '').toLowerCase();

  // resultcode 4 is their own 'error', meaning they could not complete the check.
  // Treat it as infrastructure failure so the caller refunds rather than charging.
  if (raw === 'error' || raw === '') {
    return {
      ok: false,
      code: 'MV_RESULT_ERROR',
      error: `MillionVerifier returned result "${raw || 'empty'}"`,
    };
  }

  const mapped = VERDICT_MAP[raw];
  if (!mapped) {
    return { ok: false, code: 'MV_UNKNOWN_RESULT', error: `Unrecognized result "${raw}"` };
  }

  return {
    ok: true,
    verdict: mapped.verdict,
    billable: mapped.billable,
    raw: {
      result:        raw,
      resultcode:    body.resultcode ?? null,
      subresult:     body.subresult ?? null,
      quality:       body.quality ?? null,
      free:          body.free === true,
      role:          body.role === true,
      didyoumean:    body.didyoumean || null,
      creditsLeft:   typeof body.credits === 'number' ? body.credits : null,
      executionTime: body.executiontime ?? null,
      livemode:      body.livemode === true,
    },
  };
}

// Remaining balance. Single and bulk draw on separate pools.
export async function getMillionVerifierCredits() {
  if (!API_KEY) return { ok: false, code: 'MV_NO_API_KEY', error: 'MILLIONVERIFIER_API_KEY is not set' };

  const res = await getJson(`${SINGLE_BASE}/api/v3/credits?api=${encodeURIComponent(API_KEY)}`, HTTP_TIMEOUT_MS);
  if (!res.ok) return res;

  return {
    ok: true,
    credits:          res.body?.credits ?? null,
    bulkCredits:      res.body?.bulk_credits ?? null,
    renewingCredits:  res.body?.renewing_credits ?? null,
    plan:             res.body?.plan ?? null,
  };
}

// Bulk upload. The key travels as a form field here, not a query param like every other bulk call.
export async function uploadBulkFile(emails, filename = 'trovarcis.txt') {
  if (!API_KEY) return { ok: false, code: 'MV_NO_API_KEY', error: 'MILLIONVERIFIER_API_KEY is not set' };
  if (!Array.isArray(emails) || emails.length === 0) {
    return { ok: false, code: 'MV_EMPTY_UPLOAD', error: 'emails must be a non-empty array' };
  }

  const form = new FormData();
  form.append('key', API_KEY);
  form.append('file_contents', new Blob([emails.join('\n')], { type: 'text/plain' }), filename);

  const res = await request(`${BULK_BASE}/bulkapi/v2/upload`, { method: 'POST', body: form }, HTTP_TIMEOUT_MS);
  if (!res.ok) return res;
  if (res.body?.error) return { ok: false, code: 'MV_UPLOAD_REJECTED', error: String(res.body.error).slice(0, 300) };

  return { ok: true, fileId: res.body?.file_id ?? null, raw: res.body };
}

// Poll target. There is no webhook, so the worker polls status and percent.
export async function getBulkFileInfo(fileId) {
  if (!API_KEY) return { ok: false, code: 'MV_NO_API_KEY', error: 'MILLIONVERIFIER_API_KEY is not set' };

  const url = `${BULK_BASE}/bulkapi/v2/fileinfo?key=${encodeURIComponent(API_KEY)}&file_id=${encodeURIComponent(fileId)}`;
  const res = await getJson(url, HTTP_TIMEOUT_MS);
  if (!res.ok) return res;

  const b = res.body || {};
  return {
    ok: true,
    fileId:       b.file_id ?? fileId,
    status:       b.status ?? null,
    percent:      typeof b.percent === 'number' ? b.percent : null,
    totalRows:    b.total_rows ?? null,
    uniqueEmails: b.unique_emails ?? null,
    verified:     b.verified ?? null,
    unverified:   b.unverified ?? null,
    // Authoritative charge for this file. Preferred over inferring billability per row.
    credit:       typeof b.credit === 'number' ? b.credit : null,
    counts: {
      ok:         b.ok ?? null,
      catchAll:   b.catch_all ?? null,
      disposable: b.disposable ?? null,
      invalid:    b.invalid ?? null,
      unknown:    b.unknown ?? null,
    },
    error: b.error || null,
    raw:   b,
  };
}

// filter is one of: all, ok, ok_and_catch_all, unknown, invalid. Returns CSV text.
export async function downloadBulkResults(fileId, filter = 'all') {
  if (!API_KEY) return { ok: false, code: 'MV_NO_API_KEY', error: 'MILLIONVERIFIER_API_KEY is not set' };

  const url = `${BULK_BASE}/bulkapi/v2/download?key=${encodeURIComponent(API_KEY)}&file_id=${encodeURIComponent(fileId)}&filter=${encodeURIComponent(filter)}`;
  const res = await request(url, { method: 'GET' }, HTTP_TIMEOUT_MS, 'text');
  if (!res.ok) return res;
  return { ok: true, csv: res.body };
}

export async function stopBulkFile(fileId) {
  if (!API_KEY) return { ok: false, code: 'MV_NO_API_KEY', error: 'MILLIONVERIFIER_API_KEY is not set' };
  const url = `${BULK_BASE}/bulkapi/stop/?key=${encodeURIComponent(API_KEY)}&file_id=${encodeURIComponent(fileId)}`;
  const res = await getJson(url, HTTP_TIMEOUT_MS);
  return res.ok ? { ok: true, raw: res.body } : res;
}

// HTTP helpers. Never throw: every failure becomes { ok:false, code, error }.

async function getJson(url, timeoutMs) {
  return request(url, { method: 'GET' }, timeoutMs, 'json');
}

async function request(url, init, timeoutMs, expect = 'json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });

    if (response.status === 403) {
      // Also what an outbound egress filter returns, so do not assert the cause.
      return { ok: false, code: 'MV_FORBIDDEN', error: 'HTTP 403. Check the API key, its on/off state, IP whitelist, and outbound egress rules' };
    }
    if (response.status === 404) {
      return { ok: false, code: 'MV_NOT_FOUND', error: 'Resource not found' };
    }
    if (!response.ok) {
      return { ok: false, code: 'MV_HTTP_' + response.status, error: `HTTP ${response.status}` };
    }

    if (expect === 'text') {
      return { ok: true, body: await response.text() };
    }

    const text = await response.text();
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, code: 'MV_BAD_JSON', error: `Non-JSON response: ${text.slice(0, 200)}` };
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, code: 'MV_TIMEOUT', error: `Request exceeded ${timeoutMs}ms` };
    }
    return { ok: false, code: 'MV_NETWORK', error: err?.message ? String(err.message).slice(0, 300) : 'Network failure' };
  } finally {
    clearTimeout(timer);
  }
}

function clampInt(raw, fallback, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
