// Reads Sender's update feed (latest.yml), so the download link and the version line follow each
// release without a page edit. The feed is served from /updates/ by its own container, not by Remix.

import { getPublicUrl } from '~/utils/paymentsConfig.server';

const CACHE_MS = 60_000;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$/;

let cached = null;

// electron-builder writes flat `key: value` lines plus a files list; only three top-level keys matter.
export function parseFeed(text) {
  const read = (key) => {
    const m = String(text).match(new RegExp(`^${key}:\\s*['"]?([^'"\\r\\n]+?)['"]?\\s*$`, 'm'));
    return m ? m[1] : null;
  };
  const version = read('version');
  const path = read('path');
  const releaseDate = read('releaseDate');
  if (!version || !/^\d+\.\d+\.\d+([-+][\w.]+)?$/.test(version)) return null;
  if (!path || !FILE_RE.test(path)) return null;
  const released = releaseDate && !Number.isNaN(Date.parse(releaseDate)) ? new Date(releaseDate).toISOString() : null;
  return { version, path, releasedAt: released };
}

export async function getLatestRelease() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.release;
  const url = process.env.UPDATES_FEED_URL || `${getPublicUrl()}/updates/latest.yml`;
  let release = null;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/yaml, text/plain' }, signal: AbortSignal.timeout(5000) });
    if (res.ok) release = parseFeed(await res.text());
    else console.warn(`[update feed] ${url} answered HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[update feed] could not read ${url}: ${err.message}`);
  }
  // A failed read is cached briefly too, so a broken feed is not fetched on every page view.
  cached = { at: Date.now() - (release ? 0 : CACHE_MS / 2), release };
  return release;
}
