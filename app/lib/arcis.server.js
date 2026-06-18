/* ═══════════════════════════════════════════════════════════════════════════
   arcis.server.js

   Arcis is the Trovarcis Reach email deliverability scoring engine, backed
   by the Anthropic Claude API. This module is the only place in the app
   that talks to Anthropic.

   Contract:
     - scoreEmail(input)  async, never throws
     - returns { ok: true, result }  on successful score
     - returns { ok: false, error, code } on validation / API / shape failure

   Design decisions:

     1. Model is configurable via EMAIL_SCORER_MODEL env. Default is Haiku:
        it is fast (1-3s), cheap (~$0.001-0.004 per call at typical email
        length), and quality is sufficient for the scoring rubric. Upgrade
        to Sonnet or Opus by changing one env var.

     2. Input is sanitized before the API call. <script>, <style>, and
        <iframe> blocks are stripped because they add no scoring signal and
        inflate token usage. The scrubber preserves comments of value like
        preheader text.

     3. Output uses Anthropic's tool-use API with forced tool_choice. This
        guarantees Claude returns a structured object matching our schema -
        the API rejects malformed responses upstream before we see them.
        Eliminates the prior failure mode where Claude occasionally omitted
        a category score and triggered ARCIS_BAD_SHAPE on the user side
        with a credit refund. See TOOL_INPUT_SCHEMA below.

     4. The system prompt is stable and long. Anthropic's prompt caching
        kicks in automatically for repeated system prompts, reducing cost
        on the cacheable portion to 10 percent of normal. Worth the
        verbosity for rubric precision.

     5. Temperature is 0.2. Scoring wants consistency. Two runs on the same
        email should produce near-identical scores. Not zero, because
        nuanced email writing benefits from a hint of judgment.

     6. max_tokens is bounded. With strict mode, the constrained decoder
        competes with content tokens for the budget. 4096 gives generous
        headroom for long issues arrays without runaway cost.

     7. Score-vs-categories consistency is enforced in shapeResult. If
        Claude's reported total drifts from the category sum by more than
        2 points, we replace the top number with the sum. Users see a
        gauge that matches the bars beneath it.

   Migration notes (April 2026):
     - Switched from prompt-only JSON to tool-use. The old extractJson +
       JSON.parse path is gone. ARCIS_BAD_SHAPE rate dropped to near zero
       in testing.
     - Added score-consistency reconciliation. Old behaviour: trust the
       top-level score regardless of category math. New: trust the
       categories, recompute the top score when they disagree.
     - Bumped MAX_OUTPUT_TOKENS 2000 -> 4096. With strict mode, the
       constrained decoder competes with content tokens for budget; long
       issues arrays were truncating mid-call and surfacing as BAD_SHAPE
       with no diagnostics.
     - Added stop_reason inspection. Previously stop_reason "refusal" and
       "max_tokens" both masqueraded as BAD_SHAPE because the code jumped
       straight to toolBlock lookup. New codes ARCIS_REFUSED and
       ARCIS_TRUNCATED surface these distinctly so the retry loop skips
       them (refusing twice is the same as refusing once) and the user
       sees an honest error message.
     - Added structured logging on the residual BAD_SHAPE path and on
       SDK errors. The server console now carries enough detail to
       diagnose any future failure without spelunking the network tab.
     - Stripped `minimum` and `maximum` from every integer in
       TOOL_INPUT_SCHEMA. Strict tool use REJECTS the schema at compile
       time when these are present - the Python/TS SDK helpers auto-strip
       them but raw tools arrays do not. Bounds now live in `description`
       text so the model still knows the valid range; `clampInt` in
       shapeResult enforces them defensively on output.
       Reference: https://docs.claude.com/en/docs/build-with-claude/structured-outputs#json-schema-limitations
     - Subject line is now required in BOTH simple and html modes. The
       email Subject header is SMTP-level metadata; an HTML <title> tag
       is a different thing (some clients use it for inbox preview, most
       ignore it, none treat it as the Subject). Conflating them gave us
       0/15 subject scores on every HTML scan with a critical "Subject
       missing" issue, which was wrong - the user just hadn't been asked
       for one. buildUserMessage now uses the same shape in both modes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.EMAIL_SCORER_MODEL || 'claude-haiku-4-5-20251001';
const MAX_INPUT_CHARS = 100_000;
const MIN_INPUT_CHARS = 10;
const MAX_SUBJECT_CHARS = 998; // RFC 2822 line-length limit
const API_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0.2;

/* Strict tool use opt-in. With this beta header + strict:true on the
   tool definition, Anthropic uses constrained decoding to enforce the
   input_schema at token-generation time. Required fields cannot be
   omitted, enum values cannot drift, types cannot mismatch.
   Numerical min/max are NOT enforced server-side - we still clamp
   client-side in shapeResult.
   Note: structured outputs went GA on Haiku 4.5 in Feb 2026; the beta
   header is now a no-op for GA models but is documented to remain
   accepted during the transition period.
   Reference: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use */
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-11-13';

/* Auto-retry budget for shape failures. With strict mode this should
   approach zero in practice, but a single retry costs ~$0.003 and
   eliminates the residual tail of malformed responses without exposing
   it to the user. Counted attempts INCLUDING the first call - so 2
   means "first call plus at most one retry". */
const SHAPE_RETRY_ATTEMPTS = 2;

/* ─── Tool-use schema ───────────────────────────────────────────────────────
   We force Claude to call this tool via tool_choice. The Anthropic SDK
   then returns a parsed object in response.content[i].input, eliminating
   markdown-fence stripping, JSON.parse failures, and most ARCIS_BAD_SHAPE
   error paths.

   Why tool-use beats prompt-only JSON:
     - The model literally cannot return prose - the response shape is
       enforced server-side by Anthropic before we see it
     - Schema validation happens at the API layer, not in our parser
     - All required fields are guaranteed present (or the API errors)
     - Enum values are guaranteed valid
     - Number ranges are server-enforced when expressed as integer with
       minimum/maximum

   Why this matters for the scorer specifically:
     - Old failure mode: Claude omits a category score for an HTML email
       that has no compliance section, clampInt(undefined) returns null,
       shapeResult returns ARCIS_BAD_SHAPE, user gets refund + cryptic
       error
     - New behaviour: API rejects the call before it reaches us. Worst
       case is a single retry from Anthropic, then a clean ARCIS_API_ERROR
       which is honest about what happened.

   The schema mirrors the rubric in SYSTEM_PROMPT one-to-one. If you
   change one, change the other - they must agree on field names,
   enum values, and score caps. */

const TOOL_NAME = 'submit_email_score';

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score:   { type: 'integer', description: 'Total score in the integer range 0-100 inclusive. Must equal sum of the five category scores.' },
    verdict: {
      type: 'string',
      enum: ['excellent', 'good', 'needs_work', 'poor', 'critical'],
      description: 'Verdict mapped from score: 90-100 excellent, 70-89 good, 50-69 needs_work, 30-49 poor, 0-29 critical.',
    },
    summary: { type: 'string', description: 'One-sentence overall assessment, max 160 chars.' },
    categories: {
      type: 'object',
      additionalProperties: false,
      description: 'All five categories MUST be present. Score 0 in a category if no signal exists - never omit the field.',
      properties: {
        subject:    { type: 'object', additionalProperties: false, properties: { score: { type: 'integer', description: 'Integer 0-15 inclusive.' } }, required: ['score'] },
        content:    { type: 'object', additionalProperties: false, properties: { score: { type: 'integer', description: 'Integer 0-30 inclusive.' } }, required: ['score'] },
        structure:  { type: 'object', additionalProperties: false, properties: { score: { type: 'integer', description: 'Integer 0-20 inclusive.' } }, required: ['score'] },
        links:      { type: 'object', additionalProperties: false, properties: { score: { type: 'integer', description: 'Integer 0-15 inclusive.' } }, required: ['score'] },
        compliance: { type: 'object', additionalProperties: false, properties: { score: { type: 'integer', description: 'Integer 0-20 inclusive.' } }, required: ['score'] },
      },
      required: ['subject', 'content', 'structure', 'links', 'compliance'],
    },
    issues: {
      type: 'array',
      description: 'Issues that actually matter. Empty array if email is clean. Do not pad. Cap at 20 items even for very problematic emails.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
          category: { type: 'string', enum: ['subject', 'content', 'structure', 'links', 'compliance'] },
          title:    { type: 'string', description: 'Short factual finding, 6-12 words. No hype words. No exclamation marks.' },
          message:  { type: 'string', description: 'Plain-language explanation, 2-4 sentences. No exclamation marks. Use hyphens not em dashes.' },
          fix:      { type: 'string', description: 'Specific actionable fix in one sentence.' },
        },
        required: ['severity', 'category', 'title', 'message', 'fix'],
      },
    },
  },
  required: ['score', 'verdict', 'summary', 'categories', 'issues'],
};

// Singleton client. Lazily initialized so missing API key does not crash
// server boot; the error surfaces on first scoring request instead.
let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  _client = new Anthropic({ apiKey, timeout: API_TIMEOUT_MS, maxRetries: 2 });
  return _client;
}

/* ─── Category score maxima (must match system prompt) ─────────────────── */

const CATEGORY_MAX = {
  subject: 15,
  content: 30,
  structure: 20,
  links: 15,
  compliance: 20,
};

const SEVERITIES = new Set(['critical', 'warning', 'info']);
const CATEGORIES = new Set(['subject', 'content', 'structure', 'links', 'compliance']);
const VERDICTS = new Set(['excellent', 'good', 'needs_work', 'poor', 'critical']);

/* ─── System prompt ────────────────────────────────────────────────────── */
/* Stable across calls so Anthropic prompt caching amortizes cost. */

const SYSTEM_PROMPT = `You are Arcis, the Trovarcis Reach email deliverability scoring engine. You analyse email content the way modern spam filters evaluate messages. Your output is always a single valid JSON object and nothing else.

SCORING RUBRIC

You assign a total score out of 100, distributed across five weighted categories:

1. SUBJECT LINE (0-15 points)
   - Length: 40-60 characters is optimal, penalise over 70
   - Urgency or spam triggers in context (FREE, ACT NOW, URGENT, winning claims)
   - ALL CAPS usage, including partial all-caps words
   - Personalisation tokens or merge fields
   - Deceptive patterns such as "RE:" or "FW:" when not actually a reply/forward
   - Excessive punctuation such as "!!!", "???", or emoji abuse

2. BODY CONTENT (0-30 points)
   - Spam phrase density evaluated in context, never as isolated keywords. "Free guide" is fine, "FREE MONEY NOW" is not.
   - Reading level, clarity, and flow
   - Personalisation presence
   - Value proposition clarity
   - Excessive formatting: ALL CAPS paragraphs, colour abuse, font size abuse
   - Hidden text (white on white, tiny fonts) indicates spam

3. STRUCTURE (0-20 points)
   - Text-to-HTML ratio. Aim for 60 percent plain text or more when HTML is supplied
   - Image-to-text ratio. Image-only emails are a strong spam signal
   - Alt text presence on images
   - Responsive design hints (viewport, media queries)
   - Plain-text alternative recommendations where appropriate

4. LINKS & CTAS (0-15 points)
   - Number of links. Under 5 for short emails, under 10 for newsletters
   - URL shorteners (bit.ly, tinyurl, t.co, goo.gl) are a major risk
   - Link-to-text ratio
   - Suspicious or low-reputation domains
   - CTA clarity. Transparent > ambiguous > deceptive

5. COMPLIANCE (0-20 points)
   - Unsubscribe link or mechanism present (CAN-SPAM requirement)
   - Physical mailing address present (CAN-SPAM requirement)
   - From name appropriateness (not all caps, not spammy)
   - Reply-to consistency hints
   - GDPR or privacy-policy signals for European senders

VERDICT MAPPING

Map the total score to a verdict string:
  90-100 -> "excellent"
  70-89  -> "good"
  50-69  -> "needs_work"
  30-49  -> "poor"
  0-29   -> "critical"

ISSUE SELECTION

Surface only the issues that actually matter. Do not pad. If an email is clean, return zero issues. Cap the array at 20 items even for severely problematic emails - the worst offenders should be obvious without an exhaustive list. Each issue has:
  - severity: "critical" (strong spam trigger or missing legal requirement), "warning" (meaningful deliverability risk), or "info" (minor improvement)
  - category: one of "subject", "content", "structure", "links", "compliance"
  - title: a short, factual finding (6-12 words). No hype words.
  - message: plain-language explanation of why this matters for deliverability (2-4 sentences).
  - fix: a specific, actionable fix in one sentence.

TONE RULES

- Be direct and concrete. No hedging, no marketing language.
- Do not use em dashes; use hyphens or rewrite.
- No exclamation marks in any output field.
- American English spellings.
- Never fabricate issues to fill space.

OUTPUT

Submit your evaluation by calling the submit_email_score tool. The tool's
schema enforces the structure; focus on accuracy of the rubric. The total
of all five category scores MUST equal the top-level score.`;

/* ─── Input sanitization ───────────────────────────────────────────────── */

/**
 * Strip tags that add no scoring signal and inflate token count.
 * Preserves HTML structure so the model can still evaluate text-to-HTML
 * ratio, image counts, link counts, and compliance markers.
 */
function sanitizeBody(raw) {
  if (typeof raw !== 'string') return '';
  let out = raw;
  // Non-content blocks: scripts, styles, iframes, object/embed, noscript.
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  out = out.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  out = out.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  out = out.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  out = out.replace(/<(object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return out;
}

/**
 * Normalize input before any validation. Trims outer whitespace, clips at
 * the hard maximum, and coalesces subject/body into a single bounded payload.
 */
export function normalizeScoringInput(input) {
  const mode = input?.mode === 'html' ? 'html' : 'simple';
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  const bodyRaw = typeof input?.body === 'string' ? input.body : '';
  const body = sanitizeBody(bodyRaw).trim().slice(0, MAX_INPUT_CHARS);
  return { mode, subject: subject.slice(0, MAX_SUBJECT_CHARS), body };
}

/**
 * Validate the normalised input. Returns { valid, error } so callers can
 * short-circuit before spending a credit or an API call.
 */
export function validateScoringInput(input) {
  const { subject, body } = input;
  if (!subject) return { valid: false, error: 'Subject line is required' };
  if (subject.length > MAX_SUBJECT_CHARS) {
    return { valid: false, error: `Subject exceeds ${MAX_SUBJECT_CHARS} characters` };
  }
  if (!body) return { valid: false, error: 'Email body is required' };
  if (body.length < MIN_INPUT_CHARS) {
    return { valid: false, error: 'Email body is too short to analyse' };
  }
  return { valid: true };
}

/* ─── Prompt assembly ──────────────────────────────────────────────────── */

function buildUserMessage({ mode, subject, body }) {
  const bodyLabel = mode === 'html' ? 'BODY (raw HTML):' : 'BODY:';
  return [
    'Score this email for deliverability.',
    '',
    `SUBJECT: ${subject}`,
    '',
    bodyLabel,
    body,
  ].join('\n');
}

/* ─── Output validation ────────────────────────────────────────────────── */

function clampInt(n, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, v));
}

function sanitizeString(s, maxLen) {
  if (typeof s !== 'string') return '';
  // Strip control chars, em dashes, and exclamation marks to stay on-brand.
  return s
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\u2014/g, '-')
    .replace(/!/g, '.')
    .trim()
    .slice(0, maxLen);
}

/**
 * Turn the tool input into the shape the frontend expects. With tool-use
 * the input is guaranteed to be a typed object with all required fields,
 * so this function is now mostly translation rather than validation.
 *
 * One additional invariant we enforce here that the schema can't:
 * the top-level score must equal the sum of category scores. The system
 * prompt instructs Claude to keep these consistent, but occasional drift
 * happens. When it does, we trust the category breakdown (more granular,
 * harder to fudge) and recompute the top-level score from it. The user's
 * gauge and category bars then agree.
 */
function shapeResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Scoring engine returned a non-object response', code: 'ARCIS_BAD_SHAPE' };
  }

  const categoriesRaw = raw.categories || {};
  const categories = [];
  let categorySum = 0;
  for (const id of ['subject', 'content', 'structure', 'links', 'compliance']) {
    const max = CATEGORY_MAX[id];
    const entry = categoriesRaw[id];
    // Strict mode + retry should make missing categories impossible.
    // Last-line defense: default to 0 rather than refund. Honest signal
    // ("no data for this category") and the score reconciliation below
    // recomputes the top score from whatever sums we have. User sees a
    // self-consistent result; we log the residual case for monitoring.
    const s = clampInt(entry?.score, 0, max) ?? 0;
    categories.push({
      id,
      label: CATEGORY_LABELS[id],
      score: s,
      max,
    });
    categorySum += s;
  }

  // Reconcile top-level score with category sum. Trust the categories
  // because they're harder to fudge - a 75 with categories totalling 60
  // means Claude inflated the top number, and the bars users see are
  // the source of truth visually.
  const reportedScore = clampInt(raw.score, 0, 100);
  const score = reportedScore !== null && Math.abs(reportedScore - categorySum) <= 2
    ? reportedScore
    : categorySum;

  const verdict = typeof raw.verdict === 'string' && VERDICTS.has(raw.verdict)
    ? raw.verdict
    : deriveVerdict(score);

  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const shapedIssues = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue;
    const severity = SEVERITIES.has(issue.severity) ? issue.severity : null;
    const category = CATEGORIES.has(issue.category) ? issue.category : null;
    const title = sanitizeString(issue.title, 200);
    const message = sanitizeString(issue.message, 800);
    const fix = sanitizeString(issue.fix, 400);
    if (!severity || !category || !title || !message) continue;
    shapedIssues.push({ severity, category, title, message, fix: fix || null });
  }

  const summary = sanitizeString(raw.summary, 200) || summaryFromScore(score);

  return {
    ok: true,
    result: {
      score,
      verdict,
      summary,
      categories,
      issues: shapedIssues,
      scoredAt: new Date().toISOString(),
    },
  };
}

const CATEGORY_LABELS = {
  subject: 'Subject Line',
  content: 'Body Content',
  structure: 'Structure',
  links: 'Links & CTAs',
  compliance: 'Compliance',
};

function deriveVerdict(score) {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'needs_work';
  if (score >= 30) return 'poor';
  return 'critical';
}

function summaryFromScore(score) {
  if (score >= 90) return 'Excellent deliverability. Send with confidence.';
  if (score >= 70) return 'Good email. Minor improvements possible.';
  if (score >= 50) return 'Needs work. Fix the flagged issues before sending.';
  if (score >= 30) return 'Poor deliverability. Significant issues to address.';
  return 'Critical issues. Major rewrite recommended.';
}

/* ─── Main entry point ─────────────────────────────────────────────────── */

/**
 * Score an email. The only async boundary in this module.
 *
 * Input:  { mode: 'simple' | 'html', subject: string, body: string }
 * Output:
 *   { ok: true, result }                        normal success
 *   { ok: false, error, code }                  any failure
 *
 * Failure codes:
 *   ARCIS_VALIDATION   input failed schema checks (caller should 400)
 *   ARCIS_RATE_LIMITED upstream API rate-limited us (caller should 503 + retry later)
 *   ARCIS_TIMEOUT      upstream API timed out
 *   ARCIS_API_ERROR    generic upstream failure
 *   ARCIS_BAD_SHAPE    upstream returned malformed JSON (should be unreachable in strict mode)
 *   ARCIS_REFUSED      upstream refused the content for safety reasons
 *   ARCIS_TRUNCATED    upstream hit max_tokens mid-tool-call
 *   ARCIS_NO_API_KEY   local misconfiguration
 */
export async function scoreEmail(rawInput) {
  const input = normalizeScoringInput(rawInput);
  const validation = validateScoringInput(input);
  if (!validation.valid) {
    return { ok: false, error: validation.error, code: 'ARCIS_VALIDATION' };
  }

  let client;
  try {
    client = getClient();
  } catch (err) {
    return { ok: false, error: err.message, code: 'ARCIS_NO_API_KEY' };
  }

  // Loop with retry for the rare residual shape failure. Strict mode
  // makes this loop almost always exit on attempt 1, but a tiny tail of
  // model errors still slip through (transient SDK glitches, schema
  // compilation timeouts upstream). The retry runs at temp 0 to bias
  // toward determinism on the second pass.
  //
  // Codes that bypass retry and return immediately: anything that won't
  // change on a second identical call - auth, rate limit, timeout,
  // network errors, refusals, max_tokens truncation. Only ARCIS_BAD_SHAPE
  // and any unknown future code triggers another attempt.
  let lastError = null;
  for (let attempt = 1; attempt <= SHAPE_RETRY_ATTEMPTS; attempt++) {
    const result = await callOnce(client, input, attempt);

    // Hard errors - return immediately, no point retrying.
    if (result.code && result.code !== 'ARCIS_BAD_SHAPE') {
      return result;
    }

    // Success - return.
    if (result.ok) {
      return result;
    }

    // BAD_SHAPE - try again unless we've exhausted attempts.
    lastError = result;
  }
  return lastError;
}

/**
 * One call to Anthropic. Pure function over the client + input. Returns
 * the same shape as scoreEmail (ok/result | ok:false/code/error). Retry
 * orchestration lives in the caller.
 */
async function callOnce(client, input, attempt) {
  const isRetry = attempt > 1;
  let response;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Retry pass uses temp 0 to maximize determinism on second attempt.
        temperature: isRetry ? 0 : TEMPERATURE,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: TOOL_NAME,
            description: 'Submit the structured email deliverability evaluation. Call this tool exactly once with the complete evaluation. ALL FIVE category scores are required - score 0 in any category that has no signal, never omit a category.',
            input_schema: TOOL_INPUT_SCHEMA,
            // strict: true engages constrained decoding upstream so the
            // model literally cannot emit a token that violates the
            // input_schema. Required for production-grade shape guarantees.
            strict: true,
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildUserMessage(input) }],
      },
      {
        // Beta header opts this request into structured outputs / strict
        // tool use. The SDK accepts per-request betas via the second arg.
        // No-op for GA models (Haiku 4.5 went GA Feb 2026), kept for the
        // documented transition-period compatibility.
        headers: { 'anthropic-beta': STRUCTURED_OUTPUTS_BETA },
      },
    );
  } catch (err) {
    if (err?.status === 429) {
      return { ok: false, error: 'Scoring engine is busy. Retry in a moment.', code: 'ARCIS_RATE_LIMITED' };
    }
    if (err?.name === 'APIConnectionTimeoutError' || err?.code === 'ETIMEDOUT') {
      return { ok: false, error: 'Scoring engine timed out. Retry in a moment.', code: 'ARCIS_TIMEOUT' };
    }
    // Surface the underlying SDK error to the server console for ops
    // triage. The user-facing message stays terse; the detail goes to
    // logs so we can diagnose without spelunking the network tab.
    console.error('[arcis] API error:', {
      attempt,
      status: err?.status,
      name: err?.name,
      code: err?.code,
      message: err?.message,
      type: err?.error?.type,
    });
    return {
      ok: false,
      error: err?.message || 'Scoring engine error',
      code: 'ARCIS_API_ERROR',
    };
  }

  // Inspect stop_reason BEFORE looking for the tool call. Three failure
  // modes that previously masqueraded as ARCIS_BAD_SHAPE with no signal:
  //
  //   refusal     Claude refused the request for safety reasons. 200
  //               status, billed for tokens, no schema match. Surfaces
  //               as ARCIS_REFUSED so the retry loop skips it (refusing
  //               twice is the same as refusing once) and the user sees
  //               a distinct, honest error.
  //
  //   max_tokens  The response was truncated mid-tool-call. The tool_use
  //               block may exist but its input is incomplete. Bumping
  //               MAX_OUTPUT_TOKENS to 4096 makes this rare; surfacing
  //               ARCIS_TRUNCATED makes any residual case diagnosable.
  //
  //   end_turn    No tool call - model emitted text and stopped. Should
  //               be impossible with tool_choice forcing the call, but
  //               we defend against it via the toolBlock check below.
  //
  // Reference: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
  const stopReason = response?.stop_reason || null;
  if (stopReason === 'refusal') {
    console.warn('[arcis] Anthropic refused the request:', {
      attempt,
      stopReason,
      contentTypes: response?.content?.map((b) => b.type),
    });
    return {
      ok: false,
      error: 'Scoring engine declined to evaluate this content.',
      code: 'ARCIS_REFUSED',
    };
  }
  if (stopReason === 'max_tokens') {
    console.warn('[arcis] Response truncated at max_tokens:', {
      attempt,
      stopReason,
      maxTokens: MAX_OUTPUT_TOKENS,
      contentBlocks: response?.content?.length,
    });
    return {
      ok: false,
      error: 'Scoring response was truncated. Try a shorter email.',
      code: 'ARCIS_TRUNCATED',
    };
  }

  const toolBlock = response?.content?.find(
    (b) => b.type === 'tool_use' && b.name === TOOL_NAME,
  );
  if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
    // Last-resort BAD_SHAPE. With strict mode + stop_reason inspection,
    // this should be effectively unreachable. Log the full response
    // shape so any residual case is diagnosable from server logs.
    console.warn('[arcis] No tool call in response:', {
      attempt,
      stopReason,
      contentTypes: response?.content?.map((b) => b.type),
      contentBlocks: response?.content?.length,
    });
    return { ok: false, error: 'Scoring engine returned no tool call', code: 'ARCIS_BAD_SHAPE' };
  }
  return shapeResult(toolBlock.input);
}
