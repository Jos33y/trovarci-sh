// /guides/:slug.md - the guide as plain Markdown, for AI tools and agents.

import { getGuideMarkdown } from '~/utils/guides.server';

export function loader({ params }) {
  const md = getGuideMarkdown(params.slug);
  if (!md) return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
    },
  });
}
