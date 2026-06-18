/* ═══════════════════════════════════════════════════════════════════════════
   twilioLookup.server.js

   Tier 2 phone verification - live carrier lookup via Twilio Lookup API v2.
   This module is the ONLY place in the app that talks to Twilio.

   Contract:
     - lookupCarrier(e164)  async, never throws
     - returns { ok: true, result }   on a successful lookup (full or partial)
     - returns { ok: false, error, code }   on auth/network/API failure

   Design decisions:

     1. Lazy client init. Server boot does NOT require Twilio credentials.
        Missing creds surface as TWILIO_NO_CREDENTIALS on first call,
        which the route maps to HTTP 503 - a clear "not configured" signal
        rather than a crash on startup.

     2. Input must already be E.164. Format validation is Tier 1's job
        (phoneFormat.server.js). This module trusts that contract because
        the orchestrating route runs Tier 1 BEFORE spending any credit.

     3. Two response shapes are both 'ok: true':
          - Full data: carrier name + line type confirmed
          - Partial:  Twilio responded but couldn't classify (recently
                      allocated number, unsupported country, etc.)
        Both still cost us money on Twilio's bill, so both must be 'ok'.
        The route does NOT refund the user for partial responses.

     4. Refund logic for the route is simple: ok=false means refund.
        That includes auth failures, rate limits, timeouts, TLS errors,
        and HTTP 404 (Twilio does not bill for 404s).

     5. CNAM (caller name) is opt-in via TWILIO_INCLUDE_CNAM env var.
        It costs additional money per lookup ($0.01 vs $0.005 for
        line type alone). Default off keeps the cost predictable at
        ~$0.005/call so our 2-credit charge has 4-6x margin.

     6. SMS-capability inference uses Twilio's published line type
        taxonomy:
          - 'mobile', 'fixedVoip', 'nonFixedVoip', 'personal' -> SMS-capable
          - everything else (landline, tollFree, premium, pager...) -> not
        VoIP detection from libphonenumber is unreliable; Twilio's data
        is what makes the 2-credit cost worth it.

     7. We never log credentials. We never include the full SDK error
        in the response - the message goes to console.error for ops,
        the user sees a plain code.
   ═══════════════════════════════════════════════════════════════════════════ */

import twilio from 'twilio';

// 15s ceiling matches Email Scorer pattern. Twilio P95 is ~600ms but
// transient network issues and TLS handshakes can stretch this out.
const TIMEOUT_MS = 15_000;

// Optional CNAM. Costs more per call. Default off for predictable margin.
const INCLUDE_CNAM = process.env.TWILIO_INCLUDE_CNAM === 'true';

// Singleton client. Lazy-initialized so a missing env var does not
// crash boot - the error surfaces on first lookup attempt instead.
let _client = null;

class TwilioConfigError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new TwilioConfigError('TWILIO_NO_CREDENTIALS');
  }
  // Region pinning is opt-in. If TWILIO_REGION is unset, the SDK uses
  // the default (us1) edge.
  const opts = { autoRetry: false };
  if (process.env.TWILIO_REGION) opts.region = process.env.TWILIO_REGION;
  if (process.env.TWILIO_EDGE) opts.edge = process.env.TWILIO_EDGE;
  _client = twilio(sid, token, opts);
  return _client;
}

// Twilio's published line type vocabulary. Anything outside this set
// gets bucketed as 'unknown' for safe display.
const TYPE_LABELS = {
  mobile:       'Mobile',
  landline:     'Landline',
  fixedVoip:    'VoIP',
  nonFixedVoip: 'VoIP',
  personal:     'Personal',
  tollFree:     'Toll-free',
  premium:      'Premium rate',
  sharedCost:   'Shared cost',
  uan:          'UAN',
  voicemail:    'Voicemail',
  pager:        'Pager',
  unknown:      'Unknown',
};

const SMS_CAPABLE_TYPES = new Set([
  'mobile',
  'fixedVoip',
  'nonFixedVoip',
  'personal',
]);

/**
 * Look up carrier and line type for an E.164 number.
 *
 * @param {string} e164  E.164 formatted phone number (must start with '+').
 * @returns {Promise<object>}  { ok, result } | { ok: false, error, code }
 *
 * Failure codes:
 *   TWILIO_NO_CREDENTIALS   account SID or auth token missing
 *   TWILIO_BAD_INPUT        e164 was not a valid E.164 string
 *   TWILIO_NOT_FOUND        Twilio responded 404 (number not in their data)
 *   TWILIO_RATE_LIMITED     Twilio responded 429
 *   TWILIO_AUTH_FAILED      auth rejected (bad SID/token, suspended account)
 *   TWILIO_TIMEOUT          request exceeded TIMEOUT_MS
 *   TWILIO_TLS_FAILED       certificate validation failed (Avast/AV gotcha)
 *   TWILIO_BAD_SHAPE        unexpected response shape from Twilio
 *   TWILIO_API_ERROR        any other failure
 */
export async function lookupCarrier(e164) {
  if (typeof e164 !== 'string' || !e164.startsWith('+') || e164.length < 4) {
    return { ok: false, error: 'E.164 phone number required', code: 'TWILIO_BAD_INPUT' };
  }

  let client;
  try {
    client = getClient();
  } catch (err) {
    if (err instanceof TwilioConfigError) {
      return { ok: false, error: 'Carrier lookup is not configured', code: err.code };
    }
    return { ok: false, error: 'Carrier lookup configuration error', code: 'TWILIO_API_ERROR' };
  }

  // Build the field list. line_type_intelligence is the core data.
  // caller_name is opt-in.
  const fields = INCLUDE_CNAM ? 'line_type_intelligence,caller_name' : 'line_type_intelligence';

  // Wrap the SDK call in a timeout race. The SDK's own timeout option is
  // unreliable across versions; an explicit Promise.race gives a hard ceiling.
  let response;
  try {
    response = await raceWithTimeout(
      client.lookups.v2.phoneNumbers(e164).fetch({ fields }),
      TIMEOUT_MS
    );
  } catch (err) {
    return mapTwilioError(err);
  }

  return shapeLookupResponse(response);
}

function raceWithTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error('Twilio lookup timeout');
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
    promise
      .then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Map Twilio SDK errors into our internal error codes.
 *
 * Twilio HTTP semantics:
 *   404 = phone number not found in their data (NOT billed)
 *   429 = rate limit (NOT billed)
 *   401/403 = auth failure (NOT billed)
 *   2xx with line_type_intelligence.error_code = soft failure (BILLED)
 *
 * We only call this for hard failures, so all paths here mean "refund the user".
 */
function mapTwilioError(err) {
  const status = err?.status || err?.statusCode;
  const code = err?.code;

  // Network-layer failures.
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'ETIME') {
    return { ok: false, error: 'Carrier lookup timed out', code: 'TWILIO_TIMEOUT' };
  }
  if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    // Local antivirus (Avast) or corporate proxy intercepting TLS.
    // Not a real Twilio problem - log clearly so dev knows.
    console.error('Twilio TLS validation failed - local cert chain issue:', code);
    return { ok: false, error: 'TLS certificate validation failed', code: 'TWILIO_TLS_FAILED' };
  }

  // HTTP-layer failures from the Twilio API.
  if (status === 404) {
    return {
      ok: false,
      error: 'Carrier data not available for this number',
      code: 'TWILIO_NOT_FOUND',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      error: 'Carrier lookup is busy. Try again shortly.',
      code: 'TWILIO_RATE_LIMITED',
    };
  }
  if (status === 401 || status === 403) {
    // Log clearly - this is a deployment/config issue, not a user issue.
    console.error('Twilio auth failed - check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    return {
      ok: false,
      error: 'Carrier lookup credentials are invalid',
      code: 'TWILIO_AUTH_FAILED',
    };
  }

  // Anything else.
  console.error('Twilio lookup failed:', err?.message || err);
  return { ok: false, error: 'Carrier lookup failed', code: 'TWILIO_API_ERROR' };
}

/**
 * Translate Twilio's phone-number resource into our display shape.
 * Twilio's Node SDK passes through the line_type_intelligence bag with
 * the JSON keys (snake_case) intact; the top-level fields are camelCased.
 * We tolerate either shape on every field.
 */
function shapeLookupResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      error: 'Carrier lookup returned an unexpected response',
      code: 'TWILIO_BAD_SHAPE',
    };
  }

  const lti = raw.lineTypeIntelligence || raw.line_type_intelligence || null;
  const phoneNumber = raw.phoneNumber || raw.phone_number || null;

  // Soft failure: Twilio responded but the upstream carrier query itself
  // failed (recently allocated number, unsupported country, etc).
  // Still cost us money - return ok:true with partial data.
  if (!lti || lti.error_code || lti.errorCode) {
    return {
      ok: true,
      result: {
        carrier: null,
        lineType: 'unknown',
        lineTypeLabel: 'Unknown',
        confirmed: false,
        smsCapable: false,
        cnam: null,
        partial: true,
        valid: raw.valid !== false,
        e164: phoneNumber,
      },
    };
  }

  const type = String(lti.type || 'unknown');
  const carrierName =
    typeof lti.carrier_name === 'string' ? lti.carrier_name :
    typeof lti.carrierName === 'string'  ? lti.carrierName  : null;

  const cnam = INCLUDE_CNAM ? extractCnam(raw) : null;

  return {
    ok: true,
    result: {
      carrier: carrierName,
      lineType: type,
      lineTypeLabel: TYPE_LABELS[type] || 'Unknown',
      confirmed: true,
      smsCapable: SMS_CAPABLE_TYPES.has(type),
      cnam,
      partial: false,
      valid: raw.valid !== false,
      e164: phoneNumber,
    },
  };
}

function extractCnam(raw) {
  const cn = raw.callerName || raw.caller_name;
  if (!cn || typeof cn !== 'object') return null;
  const name = cn.callerName || cn.caller_name;
  return typeof name === 'string' && name ? name : null;
}
