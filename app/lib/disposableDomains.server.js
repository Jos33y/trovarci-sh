/* ═══════════════════════════════════════════════════════════════════════════
   disposableDomains.server.js

   Loads data/disposable_domains.txt at module init and exposes O(1) Set
   lookups. The file is read once per Node process - re-reads do not happen
   even if the file changes, so a refresh requires a process restart (worker
   or web server). For a build-time bundled list this is the correct
   behaviour: regenerate the file via scripts/buildDisposableDomains.mjs,
   commit, deploy.

   Memory cost: ~120k Set entries x ~50 bytes per entry overhead = ~6MB. The
   underlying string data is shared with V8's internalized string pool when
   strings are short and ASCII-only, so actual heap impact is closer to 4MB.
   Negligible.

   Lookup cost: Set.has() is O(1) amortized.

   Lazy initialisation: module-level loading would crash boot if the file is
   missing or malformed. Lazy initialization surfaces the error on first
   call instead, which the caller can handle (and the verifier route maps
   to a 503 the same way it handles other configuration errors).
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_FILE = resolve(process.cwd(), 'data/disposable_domains.txt');

let _set = null;
let _loadErr = null;

/**
 * Read the disposable domains file once and cache the parsed Set.
 * Subsequent calls return the cached Set.
 */
function loadOnce(filePath = DEFAULT_FILE) {
  if (_set) return _set;
  if (_loadErr) throw _loadErr;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const set = new Set();
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      set.add(t.toLowerCase());
    }
    _set = set;
    return _set;
  } catch (err) {
    _loadErr = new Error(`Failed to load disposable domains file at ${filePath}: ${err.message}`);
    _loadErr.code = 'DISPOSABLE_LIST_LOAD_FAILED';
    throw _loadErr;
  }
}

/**
 * Returns true if the domain is in the disposable list. Domain is matched
 * exactly (case-insensitive). Subdomains are NOT auto-matched - if the
 * caller wants to flag mail.disposable.com because disposable.com is
 * listed, they must check both explicitly.
 *
 * Throws on first call if the disposable list cannot be loaded. Wraps in a
 * try/catch in production routes - a missing list should not 500 the
 * verifier, just skip the disposable check.
 *
 * @param {string} domain - lowercased domain part (e.g. "mailinator.com")
 * @returns {boolean}
 */
export function isDisposable(domain) {
  if (typeof domain !== 'string' || !domain) return false;
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return false;
  return loadOnce().has(normalized);
}

/**
 * Returns the count of loaded entries. Diagnostics only - exposed so a
 * /health endpoint can confirm the list loaded with the expected size.
 */
export function getDisposableCount() {
  try {
    return loadOnce().size;
  } catch {
    return 0;
  }
}

/**
 * Force a reload of the file. Test-only helper. NOT exposed to runtime
 * code - the file is bundled at build time and changes require a deploy.
 */
export function _resetForTests(filePath) {
  _set = null;
  _loadErr = null;
  if (filePath) loadOnce(filePath);
}
