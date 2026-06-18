/* ═══════════════════════════════════════════════════════════════════════════
   worker/phoneProcessor.js

   Per-item processor for bulk PHONE verification jobs. Counterpart to
   emailProcessor.js. Wraps phoneFormat (Tier 1) and twilioLookup (Tier 2)
   with retry policy and progress ticking.

   Two-stage probe:

     Stage 1 - Format check (free, in-process):
       Validates with libphonenumber-js. Failures terminate immediately
       with category='invalid' subcategory='format_invalid'. No Twilio
       call is made. No retry.

     Stage 2 - Carrier lookup (Twilio, billed):
       Only runs on format-valid numbers. Maps the line type to our
       category taxonomy:

         line type     -> category   subcategory
         mobile        -> valid      mobile        (SMS-capable)
         personal      -> valid      mobile        (SMS-capable)
         fixedVoip     -> risky      voip          (variable SMS support)
         nonFixedVoip  -> risky      voip          (variable SMS support)
         landline      -> risky      landline      (no SMS)
         tollFree      -> risky      landline      (no SMS, business line)
         premium       -> risky      landline
         sharedCost    -> risky      landline
         pager         -> risky      landline
         voicemail     -> risky      landline
         uan           -> risky      landline
         unknown       -> unknown    lookup_failed

   Why mobile is 'valid' and landline is 'risky', not 'invalid':
     'invalid' means the number is malformed or unreachable. A landline
     IS a real, reachable number - it just can't receive SMS. Bucketing
     it as 'invalid' would lie to the user. 'risky' carries the right
     semantic: "this is a real number, but think twice before texting."
     Same approach Twilio's own console takes.

   Retry policy:
     Infrastructure failure (TIMEOUT, RATE_LIMITED, AUTH, network):
       attempt 1 -> retry in 30s
       attempt 2 -> mark error with the failure code

     TWILIO_NOT_FOUND (HTTP 404 from Twilio):
       Number is not in their data. Terminal, NOT a retry. Marks the
       item done with category='invalid' subcategory='unreachable'.
       Twilio does NOT bill us for 404s but we still consumed a credit
       at job start - the route's natural-completion model treats this
       as legitimate "we did the work, the answer is no" rather than an
       infrastructure failure. (Refund on natural-completion errors is a
       polish-pass item.)

     TWILIO_RATE_LIMITED:
       Treated as infra retry. Twilio's own backoff guidance is "wait
       and try again". 30s is comfortable; the worker will return to
       this item on the next loop tick after the retry window elapses.

   Never throws. Both probe libs are contractually never-throws; this
   function still wraps them in try/catch as belt-and-braces because a
   crash here would leave an item stuck in 'processing' forever (the
   stuck-recovery loop would catch it after 10 minutes, but that wastes
   queue slots).

   Concurrency note:
     The main loop spawns multiple processItem calls in parallel. Each
     calls Twilio Lookup which is per-call (no batch). Twilio's default
     account rate limit is ~100 req/sec; with WORKER_PHONE_CONCURRENCY=5
     and ~1s P95 latency we run at 5 req/sec - well under the ceiling.
     If your account has reduced rate limits, drop concurrency to 2-3.
   ═══════════════════════════════════════════════════════════════════════════ */

import { validateAndFormat } from '../app/lib/phoneFormat.server.js';
import { lookupCarrier }     from '../app/lib/twilioLookup.server.js';
import {
  markItemDone,
  markItemError,
  scheduleItemRetry,
  tickJobProgress,
  refundUnusedCreditsForJob,
} from '../app/lib/jobQueue.server.js';

// Infrastructure retry: 1 retry after 30s. Same shape as emailProcessor.
const INFRA_RETRY_SECONDS = 30;
const INFRA_RETRY_LIMIT   = 1; // attempts <= this means "still has retry budget"

// Twilio failure codes we treat as transient infrastructure issues
// (worth one retry). Anything else is terminal on first hit.
const INFRA_RETRY_CODES = new Set([
  'TWILIO_TIMEOUT',
  'TWILIO_RATE_LIMITED',
  'TWILIO_TLS_FAILED',
  'TWILIO_API_ERROR',  // 5xx, network, anything we couldn't classify
  'TWILIO_BAD_SHAPE',  // unexpected response - might be a transient SDK glitch
]);

// Codes that we never retry. Either user-facing (handled at route level
// before enqueue) or hard auth/config issues that won't recover by trying again.
const TERMINAL_CONFIG_CODES = new Set([
  'TWILIO_NO_CREDENTIALS',
  'TWILIO_AUTH_FAILED',
  'TWILIO_BAD_INPUT',
]);

// Default country for format check when an item's input has no '+' prefix
// and the job did not specify one in metadata. US matches the single-mode
// route default.
const DEFAULT_FALLBACK_COUNTRY = 'US';

/**
 * Process a single claimed phone-verification item end-to-end. Always
 * finalizes the item row (done | error | scheduled_retry) and ticks the
 * parent job's progress count.
 *
 * @param {object} item - row returned by jobQueue.claimItems()
 *   { id, jobId, rowIndex, input, attempts, userId, jobMetadata }
 *   jobMetadata.country (optional ISO 3166 alpha-2) is used as the
 *   default country for inputs without a leading '+'.
 */
export async function processItem(item) {
  const country = pickCountry(item.jobMetadata);

  // -------------------------------------------------------------------
  // Stage 1: Format check. Free, in-process.
  // -------------------------------------------------------------------
  let format;
  try {
    format = validateAndFormat(item.input, country);
  } catch (err) {
    // phoneFormat is contractually never-throws. Belt-and-brace just in case.
    console.error(`[worker:phone] uncaught throw in phoneFormat for ${item.input}:`, err);
    await safeMarkError(item.id, 'PHONE_FORMAT_UNCAUGHT', { error: String(err) });
    await safeTick(item.jobId);
    return;
  }

  if (!format.ok) {
    // Terminal: mark invalid, no Twilio call, no retry. The user paid a
    // credit for this row at job start; consistent with email syntax-fail
    // which also terminates without a probe but consumes a credit.
    await safeMarkDone(item.id, {
      category:    'invalid',
      subcategory: 'format_invalid',
      result: {
        valid: false,
        formatCode: format.code,
        formatError: format.error,
        partial: format.partial || null,
        input: item.input,
      },
    });
    await safeTick(item.jobId);
    return;
  }

  const e164 = format.result.e164;

  // -------------------------------------------------------------------
  // Stage 2: Twilio carrier lookup. Billed.
  // -------------------------------------------------------------------
  let lookup;
  try {
    lookup = await lookupCarrier(e164);
  } catch (err) {
    // twilioLookup is contractually never-throws. Belt-and-brace.
    console.error(`[worker:phone] uncaught throw in lookupCarrier for ${e164}:`, err);
    await safeMarkError(item.id, 'PHONE_LOOKUP_UNCAUGHT', { error: String(err), e164 });
    await safeTick(item.jobId);
    return;
  }

  if (!lookup.ok) {
    // Twilio NOT_FOUND is terminal as 'invalid/unreachable'. The user
    // paid for the lookup attempt; the answer is "this number isn't in
    // Twilio's data" which is the answer they bought.
    if (lookup.code === 'TWILIO_NOT_FOUND') {
      await safeMarkDone(item.id, {
        category:    'invalid',
        subcategory: 'unreachable',
        result: {
          valid: false,
          e164,
          formatResult: format.result,
          twilioCode: lookup.code,
          twilioError: lookup.error,
        },
      });
      await safeTick(item.jobId);
      return;
    }

    // Hard config failures (no credentials, auth failed, bad input) are
    // terminal AND signal an operational problem. Mark as error so they
    // appear in the error-count UI and the operator can investigate.
    if (TERMINAL_CONFIG_CODES.has(lookup.code)) {
      await safeMarkError(item.id, lookup.code, {
        error: lookup.error,
        e164,
        formatResult: format.result,
      });
      await safeTick(item.jobId);
      return;
    }

    // Transient infrastructure issue. One retry, then give up.
    if (INFRA_RETRY_CODES.has(lookup.code) && item.attempts <= INFRA_RETRY_LIMIT) {
      await safeScheduleRetry(item.id, INFRA_RETRY_SECONDS);
      await safeTick(item.jobId);
      return;
    }

    // Out of retry budget OR unknown code. Mark error.
    await safeMarkError(item.id, lookup.code || 'PHONE_LOOKUP_FAILED', {
      error: lookup.error,
      e164,
      formatResult: format.result,
    });
    await safeTick(item.jobId);
    return;
  }

  // -------------------------------------------------------------------
  // Successful lookup. Classify by line type.
  // -------------------------------------------------------------------
  const verdict = classifyLookup(lookup.result, format.result);

  await safeMarkDone(item.id, verdict);
  await safeTick(item.jobId);
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Pick the default country from a job's metadata. Falls back to US if not
 * provided or invalid (mirrors api.tools.verify-number.js single-mode).
 */
function pickCountry(jobMetadata) {
  const c = jobMetadata && typeof jobMetadata.country === 'string' ? jobMetadata.country.toUpperCase() : null;
  if (c && /^[A-Z]{2}$/.test(c)) return c;
  return DEFAULT_FALLBACK_COUNTRY;
}

/**
 * Map a Twilio Lookup result to our (category, subcategory, result) shape.
 *
 * Partial responses (Twilio responded but couldn't classify the line type)
 * are bucketed as 'unknown' / 'lookup_failed' - the user paid for a lookup
 * and got an inconclusive answer, which is informational not erroneous.
 */
function classifyLookup(lookup, format) {
  // Partial: Twilio responded but the upstream carrier couldn't classify.
  if (lookup.partial) {
    return {
      category:    'unknown',
      subcategory: 'lookup_failed',
      result: {
        valid:        false,
        e164:         lookup.e164 || format.e164,
        carrier:      null,
        lineType:     'unknown',
        smsCapable:   false,
        partial:      true,
        formatResult: format,
        lookupResult: lookup,
      },
    };
  }

  const t = lookup.lineType;
  let category, subcategory;

  // Mobile and personal numbers reliably accept SMS - clean 'valid'.
  if (t === 'mobile' || t === 'personal') {
    category    = 'valid';
    subcategory = 'mobile';
  }
  // VoIP can or cannot accept SMS depending on provider - 'risky'.
  else if (t === 'fixedVoip' || t === 'nonFixedVoip') {
    category    = 'risky';
    subcategory = 'voip';
  }
  // Landline-equivalents - never accept SMS. Bucketed under 'risky'
  // because the number is real but unsuitable for the typical SMS use case.
  else if (
    t === 'landline'   ||
    t === 'tollFree'   ||
    t === 'premium'    ||
    t === 'sharedCost' ||
    t === 'pager'      ||
    t === 'voicemail'  ||
    t === 'uan'
  ) {
    category    = 'risky';
    subcategory = 'landline';
  }
  // Twilio returned a line type we don't recognize - treat as unknown.
  else {
    category    = 'unknown';
    subcategory = 'lookup_failed';
  }

  return {
    category,
    subcategory,
    result: {
      valid:         lookup.valid !== false,
      e164:          lookup.e164 || format.e164,
      carrier:       lookup.carrier,
      lineType:      lookup.lineType,
      lineTypeLabel: lookup.lineTypeLabel,
      confirmed:     lookup.confirmed,
      smsCapable:    lookup.smsCapable,
      cnam:          lookup.cnam,
      formatResult:  format,
    },
  };
}

/* ─── Safe wrappers ────────────────────────────────────────────────────────
   The processor must finish even if a finalize call throws (e.g. transient
   DB hiccup). We log and move on; the stuck-item recovery loop will pick
   up anything left in 'processing' state after 10 minutes.
   ──────────────────────────────────────────────────────────────────────── */

async function safeMarkDone(itemId, verdict) {
  try { await markItemDone(itemId, verdict); }
  catch (err) { console.error(`[worker:phone] markItemDone failed for ${itemId}:`, err.message); }
}

async function safeMarkError(itemId, code, payload) {
  try { await markItemError(itemId, { errorCode: code, result: payload }); }
  catch (err) { console.error(`[worker:phone] markItemError failed for ${itemId}:`, err.message); }
}

async function safeScheduleRetry(itemId, delaySeconds) {
  try { await scheduleItemRetry(itemId, delaySeconds); }
  catch (err) { console.error(`[worker:phone] scheduleItemRetry failed for ${itemId}:`, err.message); }
}

async function safeTick(jobId) {
  let tickResult = null;
  try {
    tickResult = await tickJobProgress(jobId);
  } catch (err) {
    console.error(`[worker:phone] tickJobProgress failed for ${jobId}:`, err.message);
    return;
  }

  // Natural-completion refund. See emailProcessor.js for full rationale.
  if (tickResult?.isComplete && tickResult.counts.error > 0) {
    try {
      const r = await refundUnusedCreditsForJob(jobId);
      if (r?.ok && !r.idempotent) {
        console.log(`[worker:phone] refunded ${r.refunded} credits on natural completion of job ${jobId} (${tickResult.counts.error} errored items)`);
      }
    } catch (err) {
      console.error(`[worker:phone] refundUnusedCreditsForJob failed for ${jobId}:`, err.message);
    }
  }
}
