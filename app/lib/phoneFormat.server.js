/* ═══════════════════════════════════════════════════════════════════════════
   phoneFormat.server.js

   Tier 1 phone number validation. Pure local computation backed by
   libphonenumber-js (Google's libphonenumber data, packaged for JS). No
   external API calls, no network. Free, instant.

   Contract:
     - validateAndFormat(rawNumber, defaultCountry?)  sync, never throws
     - returns { ok: true, result }   on a valid number
     - returns { ok: false, error, code, partial? }   on any failure

   Design decisions:

     1. Caller passes a raw user-entered number plus an optional ISO 3166
        alpha-2 country code. If the number begins with '+' the country
        argument is ignored - the library reads it from the prefix. If
        not, the country defaults to US.

     2. Input is sanity-capped before any parsing. A 10MB phone number
        submission is a DoS payload, not data. Cap is generous enough
        for any real input plus formatting characters.

     3. We expose the parsed result with three formats (E.164, national,
        international) so the frontend never has to re-format. E.164 is
        what gets passed to Twilio in Tier 2.

     4. Type estimate is the libphonenumber heuristic - based on number
        range assignments. It can be wrong for ported / VoIP numbers.
        This is exactly why Tier 2 (Twilio) exists.

     5. On invalid numbers we return a `partial` block with whatever the
        library could derive (country guess, raw E.164 attempt). The
        frontend uses this for a friendlier error message than just
        'invalid'.

     6. Country names come from Intl.DisplayNames, which is built into
        Node 18+. No extra dependency for ~250 country labels.

     7. Region detection (state/province) is NOT included. libphonenumber-js
        does not ship the geocoding dataset. Adding it would mean shipping
        a separate ~700KB dataset for marginal value (most users care about
        country, not "California"). Documented in INTEGRATE-phone-verifier.md.
   ═══════════════════════════════════════════════════════════════════════════ */

import { parsePhoneNumberWithError, ParseError } from 'libphonenumber-js';

// 32 chars accommodates any real phone input including formatting:
// '+1 (415) 555-0123 ext. 4567' is 27 chars. Anything longer is junk.
const MAX_INPUT_LENGTH = 32;

// libphonenumber-js getType() return values mapped to user-facing labels.
// Anything not in this map falls back to 'Unknown'.
const TYPE_LABELS = {
  MOBILE:               'Mobile',
  FIXED_LINE:           'Landline',
  FIXED_LINE_OR_MOBILE: 'Mobile or Landline',
  VOIP:                 'VoIP',
  TOLL_FREE:            'Toll-free',
  PREMIUM_RATE:         'Premium rate',
  SHARED_COST:          'Shared cost',
  PERSONAL_NUMBER:      'Personal',
  PAGER:                'Pager',
  UAN:                  'UAN',
  VOICEMAIL:            'Voicemail',
};

// Cache the DisplayNames instance - cheap to call thereafter.
let _countryNames = null;
function safeRegionName(code) {
  if (!code) return null;
  if (!_countryNames) {
    try {
      _countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      _countryNames = { of: (c) => c };
    }
  }
  try {
    return _countryNames.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Validate and format a phone number.
 *
 * @param {string} rawNumber          User-entered phone number, any format.
 * @param {string} [defaultCountry]   ISO 3166 alpha-2. Used when input has no country code.
 * @returns {object}                  { ok, result } | { ok: false, error, code, partial? }
 */
export function validateAndFormat(rawNumber, defaultCountry = 'US') {
  // 1. Sanitize input.
  if (typeof rawNumber !== 'string') {
    return { ok: false, error: 'Phone number is required', code: 'PHONE_EMPTY' };
  }
  const cleaned = rawNumber.trim().slice(0, MAX_INPUT_LENGTH);
  if (!cleaned) {
    return { ok: false, error: 'Phone number is required', code: 'PHONE_EMPTY' };
  }

  // Country argument must be a 2-letter code. Default to US for any garbage.
  const country =
    typeof defaultCountry === 'string' && /^[A-Z]{2}$/.test(defaultCountry)
      ? defaultCountry
      : 'US';

  // 2. Parse via libphonenumber. ParseError gives us granular failure codes.
  let phone;
  try {
    phone = parsePhoneNumberWithError(cleaned, country);
  } catch (err) {
    if (err instanceof ParseError) {
      return mapParseError(err.message, country);
    }
    return { ok: false, error: 'Could not parse phone number', code: 'PHONE_PARSE_FAILED' };
  }

  if (!phone) {
    return { ok: false, error: 'Could not parse phone number', code: 'PHONE_PARSE_FAILED' };
  }

  // 3. Validity check. A number can be possible (right length) but not valid
  //    (range not assigned). Surface both states for better error messaging.
  const isValid = phone.isValid();
  if (!isValid) {
    const reason = phone.isPossible()
      ? 'Number does not match a valid pattern for that country'
      : 'Number length is invalid for that country';

    return {
      ok: false,
      error: reason,
      code: phone.isPossible() ? 'PHONE_INVALID_PATTERN' : 'PHONE_INVALID_LENGTH',
      partial: {
        country: phone.country || null,
        countryName: phone.country ? safeRegionName(phone.country) : null,
        callingCode: phone.countryCallingCode ? '+' + phone.countryCallingCode : null,
        e164: safeFormat(phone, 'E.164'),
        national: safeFormat(phone, 'NATIONAL'),
      },
    };
  }

  // 4. Successful validation. Pull all the fields the frontend will display.
  const type = phone.getType();

  return {
    ok: true,
    result: {
      valid: true,
      country: phone.country || null,
      countryName: phone.country ? safeRegionName(phone.country) : null,
      callingCode: '+' + phone.countryCallingCode,
      e164: safeFormat(phone, 'E.164'),
      national: safeFormat(phone, 'NATIONAL'),
      international: safeFormat(phone, 'INTERNATIONAL'),
      typeEstimate: TYPE_LABELS[type] || 'Unknown',
      typeRaw: type || null,
      isPossible: true,
      isValid: true,
    },
  };
}

function safeFormat(phone, format) {
  try {
    return phone.format(format);
  } catch {
    return null;
  }
}

/**
 * Translate the libphonenumber-js ParseError messages into our error codes.
 * Library messages are stable, e.g. 'TOO_SHORT', 'TOO_LONG', 'NOT_A_NUMBER'.
 */
function mapParseError(msg, country) {
  const m = String(msg || '').toUpperCase();
  if (m.includes('TOO_SHORT')) {
    return { ok: false, error: `Number is too short for ${country}`, code: 'PHONE_TOO_SHORT' };
  }
  if (m.includes('TOO_LONG')) {
    return { ok: false, error: `Number is too long for ${country}`, code: 'PHONE_TOO_LONG' };
  }
  if (m.includes('NOT_A_NUMBER')) {
    return { ok: false, error: 'Input does not look like a phone number', code: 'PHONE_NAN' };
  }
  if (m.includes('INVALID_COUNTRY')) {
    return {
      ok: false,
      error: 'Could not detect country. Add a country code (like +1) or pick a country.',
      code: 'PHONE_NO_COUNTRY',
    };
  }
  return { ok: false, error: 'Phone number is not in a valid format', code: 'PHONE_PARSE_FAILED' };
}
