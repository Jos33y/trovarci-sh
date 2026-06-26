/* Markdown server utility - reads content/blog/*.md, parses frontmatter, renders HTML. Server-only. */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

marked.setOptions({ gfm: true, breaks: false });

/* Frontmatter shape - keep in sync with content/blog/*.md */
function mapFrontmatter(filename, data) {
  return {
    slug: data.slug || filename.replace(/\.md$/, ''),
    title: data.title || 'Untitled',
    description: data.description || '',
    date: data.date || '',
    author: data.author || 'Trovarcis Team',
    category: data.category || '',
    tags: data.tags || [],
    image: data.image || null,
    readingTime: data.readingTime || 5,
  };
}

/* Returns frontmatter-only metadata sorted newest first. */
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
        html: marked(content),
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
