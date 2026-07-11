// Tool analytics helper. Fire-and-forget wrapper over recordEvent for tool endpoints.
// event_type shape: `tool_${phase}_${tool}` so the existing daily rollup gives per-tool
// breakdowns without JSONB queries. Error codes go in metadata.code.

import { recordEvent, buildEventFromRequest } from './analytics.server.js';

const VALID_PHASES = new Set(['start', 'success', 'error']);
const VALID_TOOLS = new Set([
  'email_score',
  'email_verify',
  'phone_verify',
  'phone_format',
  'domain_check',
  'smtp_test',
]);

/**
 * Record a tool lifecycle event. Never throws, never awaits.
 *
 * @param {Request} request
 * @param {object}  opts
 * @param {string}  opts.tool     - One of VALID_TOOLS
 * @param {string}  opts.phase    - 'start' | 'success' | 'error'
 * @param {string=} opts.code     - Error code (phase='error' only)
 * @param {string=} opts.userId   - Authed user id, or null for anonymous
 * @param {object=} opts.metadata - Additional per-event dimensions
 */
export function recordToolEvent(request, { tool, phase, code, userId, metadata }) {
  try {
    if (!VALID_TOOLS.has(tool) || !VALID_PHASES.has(phase)) return;

    const md = { ...(metadata || {}) };
    if (phase === 'error' && code) md.code = String(code).slice(0, 64);

    const event = buildEventFromRequest(request, {
      eventType: `tool_${phase}_${tool}`,
      path: null,
      userId: userId ?? null,
      metadata: md,
    });
    recordEvent(event);
  } catch {
    // Analytics failure must never propagate to the tool response.
  }
}
