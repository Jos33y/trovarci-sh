// Reads content/blog/*.md, parses frontmatter, renders HTML. Server-only.

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { DEFAULT_AUTHOR } from './authors.js';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

marked.setOptions({ gfm: true, breaks: false });

// Headings get ids so any section can be linked to, by readers, search engines and AI agents.
// "## Some heading {#custom-id}" sets the id explicitly; otherwise it comes from the heading text.
const ID_SUFFIX = /\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$/;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      let html = this.parser.parseInline(tokens);
      const explicit = text.match(ID_SUFFIX);
      if (explicit) html = html.replace(ID_SUFFIX, '');
      const id = explicit ? explicit[1] : slugify(text);
      return id ? `<h${depth} id="${id}">${html}</h${depth}>\n` : `<h${depth}>${html}</h${depth}>\n`;
    },
  },
});

function mapFrontmatter(filename, data) {
  return {
    slug: data.slug || filename.replace(/\.md$/, ''),
    title: data.title || 'Untitled',
    description: data.description || '',
    date: data.date || '',
    updated: data.updated || '',
    author: data.author || DEFAULT_AUTHOR,
    category: data.category || '',
    tags: data.tags || [],
    image: data.image || null,
    readingTime: data.readingTime || 5,
  };
}

export function getAllPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));

  return files
    .map((filename) => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf-8');
      const { data } = matter(raw);
      return mapFrontmatter(filename, data);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Gives every table cell its column name, so on a phone each row can be shown as a card
// ("Price: $79 once") instead of a table squeezed into the screen.
function labelTableCells(html) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (table, inner) => {
    const head = inner.match(/<thead>([\s\S]*?)<\/thead>/);
    if (!head) return table;
    const labels = [...head[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/"/g, '&quot;').trim());
    const body = inner.replace(/<tr>([\s\S]*?)<\/tr>/g, (row, cells) => {
      if (!cells.includes('<td')) return row;
      let i = 0;
      return `<tr>${cells.replace(/<td(\s[^>]*)?>/g, (m, attrs = '') => `<td${attrs} data-label="${labels[i++] || ''}">`)}</tr>`;
    });
    return `<table>${body}</table>`;
  });
}

/* Returns frontmatter + rendered HTML. Null if slug not found. */
export function getPost(slug) {
  if (!fs.existsSync(BLOG_DIR)) return null;

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf-8');
    const { data, content } = matter(raw);
    const postSlug = data.slug || filename.replace(/\.md$/, '');

    if (postSlug === slug) {
      return {
        ...mapFrontmatter(filename, data),
        html: labelTableCells(marked(content)),
      };
    }
  }

  return null;
}

/* Adjacent posts in chronological order. prev = newer, next = older - matches "what came before / what came after" reading flow. */
export function getAdjacentPosts(slug) {
  const posts = getAllPosts();
  const idx = posts.findIndex((p) => p.slug === slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? posts[idx - 1] : null,
    next: idx < posts.length - 1 ? posts[idx + 1] : null,
  };
}

/* Same-category posts excluding the current one, newest first. Falls back to any-category if too few in same category. */
export function getRelatedPosts(slug, limit = 3) {
  const posts = getAllPosts();
  const current = posts.find((p) => p.slug === slug);
  if (!current) return [];

  const sameCategory = posts.filter(
    (p) => p.slug !== slug && p.category && p.category === current.category,
  );

  if (sameCategory.length >= limit) {
    return sameCategory.slice(0, limit);
  }

  /* Pad with other recent posts if same-category pool is too small. */
  const others = posts.filter(
    (p) => p.slug !== slug && !sameCategory.some((s) => s.slug === p.slug),
  );
  return [...sameCategory, ...others].slice(0, limit);
}
