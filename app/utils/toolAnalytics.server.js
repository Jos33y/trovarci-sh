// Tool analytics helper. event_type is `tool_${phase}_${tool}`; error codes go in metadata.code.

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

// Tool APIs are called from the tool page, so the same-origin Referer is the page the tool was used on.
function toolPagePath(request) {
  const ref = request.headers.get('referer');
  if (!ref) return null;
  try {
    const u = new URL(ref);
    // Behind the proxy request.url can carry an internal host, so match our domain too.
    const own = u.host === new URL(request.url).host || u.hostname === 'trovarci.sh' || u.hostname === 'www.trovarci.sh';
    return own ? u.pathname.slice(0, 512) : null;
  } catch {
    return null;
  }
}

// Never throws, never awaits: analytics must not affect the tool response.
export function recordToolEvent(request, { tool, phase, code, userId, metadata }) {
  try {
    if (!VALID_TOOLS.has(tool) || !VALID_PHASES.has(phase)) return;

    const md = { ...(metadata || {}) };
    if (phase === 'error' && code) md.code = String(code).slice(0, 64);

    const event = buildEventFromRequest(request, {
      eventType: `tool_${phase}_${tool}`,
      path: toolPagePath(request),
      userId: userId ?? null,
      metadata: md,
    });
    recordEvent(event);
  } catch {
    // Swallowed on purpose.
  }
}
