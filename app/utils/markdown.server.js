/*
 * MARKDOWN SERVER UTILITY
 *
 * Reads .md files from content/blog/, parses frontmatter with
 * gray-matter, renders HTML with marked. Server-only — never
 * ships to the browser.
 *
 * Install: npm install gray-matter marked
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// Configure marked for clean output
marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Get all blog posts, sorted by date (newest first).
 * Returns frontmatter only — no HTML content.
 */
export function getAllPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"));

  const posts = files
    .map((filename) => {
      const filePath = path.join(BLOG_DIR, filename);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);

      return {
        slug: data.slug || filename.replace(/\.md$/, ""),
        title: data.title || "Untitled",
        description: data.description || "",
        date: data.date || "",
        author: data.author || "Trovarcis Team",
        category: data.category || "",
        tags: data.tags || [],
        image: data.image || null,
        readingTime: data.readingTime || 5,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return posts;
}

/**
 * Get a single blog post by slug.
 * Returns frontmatter + rendered HTML content.
 */
export function getPost(slug) {
  if (!fs.existsSync(BLOG_DIR)) return null;

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));

  for (const filename of files) {
    const filePath = path.join(BLOG_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    const postSlug = data.slug || filename.replace(/\.md$/, "");

    if (postSlug === slug) {
      return {
        slug: postSlug,
        title: data.title || "Untitled",
        description: data.description || "",
        date: data.date || "",
        author: data.author || "Trovarcis Team",
        category: data.category || "",
        tags: data.tags || [],
        image: data.image || null,
        readingTime: data.readingTime || 5,
        html: marked(content),
      };
    }
  }

  return null;
}
