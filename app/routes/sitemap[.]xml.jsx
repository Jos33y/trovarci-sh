// app/routes/sitemap[.]xml.jsx
export async function loader() {
    const urls = [
        '/', '/score', '/domain', '/verify', '/verify-number',
        '/smtp-test', '/records', '/tools', '/blog',
        '/pricing', '/credits', '/download',
        '/privacy', '/terms', '/refund',
        '/login', '/signup', '/forgot-password',
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>https://trovarci.sh${u}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}