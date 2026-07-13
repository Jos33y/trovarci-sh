// Dynamic sitemap. Static routes hardcoded; blog posts read from content/blog/*.md at request time.
// Cached 1h via HTTP Cache-Control header.

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const BASE_URL = 'https://trovarci.sh';

// Public indexable routes. Order matters as a weak crawl-priority signal to Google.
const STATIC_URLS = [
    '/',
    '/tools',
    '/score',
    '/domain',
    '/verify',
    '/verify-number',
    '/smtp-test',
    '/records',
    '/blog',
    '/download',
    '/credits',
    '/contact',
    '/privacy',
    '/terms',
    '/refund',
];

async function getBlogPosts() {
    try {
        const blogDir = path.join(process.cwd(), 'content', 'blog');
        const files = await fs.readdir(blogDir);
        const posts = [];

        for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const raw = await fs.readFile(path.join(blogDir, file), 'utf-8');
            const { data } = matter(raw);

            if (data.draft === true) continue;

            const slug = data.slug || file.replace(/\.md$/, '');
            // Prefer explicit updated field over publish date so rewrites bump the crawler signal.
            const lastmod = data.updated || data.date || null;

            posts.push({ slug, lastmod });
        }

        return posts;
    } catch {
        // Blog dir missing or unreadable - return empty rather than 500 the sitemap.
        return [];
    }
}

function urlEntry(loc, lastmod) {
    let entry = `  <url>\n    <loc>${BASE_URL}${loc}</loc>`;
    if (lastmod) {
        const iso = new Date(lastmod).toISOString().slice(0, 10);
        entry += `\n    <lastmod>${iso}</lastmod>`;
    }
    entry += '\n  </url>';
    return entry;
}

export async function loader() {
    const posts = await getBlogPosts();

    const entries = [
        ...STATIC_URLS.map((u) => urlEntry(u, null)),
        ...posts.map((p) => urlEntry(`/blog/${p.slug}`, p.lastmod)),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
