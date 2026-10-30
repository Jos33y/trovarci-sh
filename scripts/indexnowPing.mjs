// IndexNow ping: tells Bing, Yandex, Seznam, Naver and others which URLs changed.
// --changed compares each sitemap page's content with what was last sent, so it needs no git history.

import crypto from 'node:crypto';

const BASE_URL = 'https://trovarci.sh';
const HOST = 'trovarci.sh';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY = process.env.INDEXNOW_KEY;
// Inside the container the app answers on its own port; reading it directly skips Cloudflare and its cache.
const LOCAL_BASE = process.env.INDEXNOW_FETCH_BASE || `http://127.0.0.1:${process.env.PORT || 3000}`;
const READY_TIMEOUT_MS = 90_000;
const BATCH = 10_000;

const args = process.argv.slice(2);
const flags = {
  all: args.includes('--all'),
  blog: args.includes('--blog-only'),
  tools: args.includes('--tools-only'),
  changed: args.includes('--changed'),
  baseline: args.includes('--baseline'),
  dryRun: args.includes('--dry-run'),
  help: args.includes('--help') || args.includes('-h'),
  urls: args.filter((a) => a.startsWith('http')),
};

function usage() {
  console.log(`
IndexNow ping utility for ${HOST}

Usage:
  node scripts/indexnowPing.mjs [mode] [--dry-run]

Modes:
  --changed       Ping sitemap pages whose content changed since the last ping, plus new and removed pages
  --baseline      Record every sitemap page as sent, without pinging
  --all           Ping every URL in the sitemap
  --blog-only     Ping only /blog/ post URLs
  --tools-only    Ping only tool pages
  <urls>          Ping specific URLs

Options:
  --dry-run       Print what would be pinged; send and store nothing

Env:
  INDEXNOW_KEY          required for pinging
  DATABASE_URL          required for --changed and --baseline
  INDEXNOW_FETCH_BASE   where to read pages from (default http://127.0.0.1:$PORT, else live site)
`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Post-deployment can run while the new container is still migrating, so wait for /healthz.
async function waitForApp(base) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      // Not up yet.
    }
    await sleep(2000);
  }
  return false;
}

async function resolveFetchBase() {
  if (await waitForApp(LOCAL_BASE)) return LOCAL_BASE;
  console.warn(`[warn] ${LOCAL_BASE} did not answer; reading pages from ${BASE_URL} instead.`);
  return BASE_URL;
}

async function fetchSitemapUrls(base) {
  const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Sitemap fetch failed: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function filterUrls(urls) {
  if (flags.blog) return urls.filter((u) => u.includes('/blog/'));
  if (flags.tools) return urls.filter((u) => /\/(score|domain|verify|verify-number|smtp-test|records)$/.test(u));
  return urls;
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;|&#160;/g, ' ');
}

// What a search engine indexes: title, description, canonical, structured data, visible text and links.
// Asset file names and CSS class hashes are left out, so a rebuild alone never counts as a change.
export function fingerprint(html) {
  const pick = (re) => (html.match(re) || [])[1] || '';
  const title = pick(/<title>([\s\S]*?)<\/title>/i);
  const description = pick(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const canonical = pick(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const robots = pick(/<meta\s+name="robots"\s+content="([^"]*)"/i);

  const main = pick(/<main\b[^>]*>([\s\S]*)<\/main>/i) || pick(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const ldJson = [...main.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
  const withoutScripts = main
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const hrefs = [...withoutScripts.matchAll(/\bhref="([^"#]*)"/gi)].map((m) => m[1]).filter(Boolean).sort();
  const alts = [...withoutScripts.matchAll(/\balt="([^"]*)"/gi)].map((m) => m[1]);
  const text = decode(withoutScripts.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

  const material = JSON.stringify({ title, description, canonical, robots, ldJson, text, hrefs, alts });
  return crypto.createHash('sha256').update(material).digest('hex');
}

async function fingerprintUrl(base, url) {
  const u = new URL(url);
  const res = await fetch(`${base}${u.pathname}${u.search}`, {
    headers: { 'User-Agent': 'TrovarcisIndexNow/1.0 (+https://trovarci.sh)' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  if (res.status !== 200) return { url, status: res.status, hash: `status:${res.status}` };
  return { url, status: 200, hash: fingerprint(await res.text()) };
}

async function ping(urls) {
  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${BASE_URL}/${KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(30000),
    });
    // 200 and 202 are accepted; 202 means the key is still being validated.
    if (res.status !== 200 && res.status !== 202) {
      const text = await res.text().catch(() => '');
      throw new Error(`IndexNow returned status=${res.status} ${text}`.trim());
    }
    console.log(`[OK] IndexNow accepted ${urlList.length} URL(s). status=${res.status}`);
  }
}

async function runChanged() {
  const { sql } = await import('../app/utils/db.server.js');
  try {
    const base = await resolveFetchBase();
    const sitemap = await fetchSitemapUrls(base);
    console.log(`Sitemap: ${sitemap.length} URLs (read from ${base})`);

    const pages = [];
    for (const url of sitemap) {
      try {
        pages.push(await fingerprintUrl(base, url));
      } catch (err) {
        console.warn(`[warn] could not read ${url}: ${err.message}`);
      }
    }
    for (const p of pages.filter((x) => x.status !== 200)) {
      console.warn(`[warn] ${p.url} answered ${p.status}; it is listed in the sitemap but not served as a page.`);
    }

    const stored = new Map((await sql`SELECT url, content_hash FROM indexnow_pages`).map((r) => [r.url, r.content_hash]));
    const inSitemap = new Set(sitemap);
    const changed = pages.filter((p) => stored.get(p.url) !== p.hash);
    const removed = [...stored.keys()].filter((u) => !inSitemap.has(u));

    const fresh = changed.filter((p) => !stored.has(p.url)).length;
    console.log(`Changed: ${changed.length - fresh}  New: ${fresh}  Removed from sitemap: ${removed.length}  Unchanged: ${pages.length - changed.length}`);

    const toPing = [...changed.map((p) => p.url), ...removed];
    if (toPing.length === 0) {
      console.log('[skip] Nothing changed since the last ping.');
      return;
    }
    for (const u of toPing) console.log(`  ${u}`);

    if (flags.dryRun) {
      console.log('\n[dry-run] Nothing sent or stored.');
      return;
    }
    if (!flags.baseline) await ping(toPing);

    // Stored only after IndexNow accepted, so a failed ping is retried on the next deploy.
    await sql.begin(async (tx) => {
      for (const p of changed) {
        await tx`
          INSERT INTO indexnow_pages (url, content_hash, pinged_at)
          VALUES (${p.url}, ${p.hash}, now())
          ON CONFLICT (url) DO UPDATE SET content_hash = EXCLUDED.content_hash, pinged_at = now()
        `;
      }
      if (removed.length) await tx`DELETE FROM indexnow_pages WHERE url = ANY(${removed})`;
    });
    console.log(flags.baseline ? '[OK] Baseline recorded, nothing pinged.' : '[OK] Fingerprints stored.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  if (flags.help || args.length === 0) {
    usage();
    return;
  }

  if (!KEY && !flags.dryRun && !flags.baseline) {
    throw new Error('INDEXNOW_KEY env var not set.');
  }

  if (flags.changed || flags.baseline) {
    await runChanged();
    return;
  }

  let urls = [];
  if (flags.urls.length > 0) {
    urls = flags.urls;
  } else if (flags.all || flags.blog || flags.tools) {
    urls = filterUrls(await fetchSitemapUrls(BASE_URL));
  } else {
    usage();
    process.exitCode = 1;
    return;
  }

  if (urls.length === 0) {
    console.log('[skip] No URLs to ping.');
    return;
  }
  console.log(`URLs to ping (${urls.length}):`);
  for (const u of urls) console.log(`  ${u}`);
  if (flags.dryRun) {
    console.log('\n[dry-run] No POST sent.');
    return;
  }
  await ping(urls);
}

main().catch((err) => {
  // A failed ping must not fail the deploy; the next deploy retries the same pages.
  console.error('[FAIL]', err.message);
  process.exitCode = 0;
});
