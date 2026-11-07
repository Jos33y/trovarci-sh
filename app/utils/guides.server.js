// Guides: short how-to pages in content/guides/*.md. Server-only.
// Each file is checked on load; a guide that breaks the rules is left out and logged,
// so one bad file never takes the help desk down.

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { getAllPosts, labelTableCells, fillPrices } from './markdown.server.js';

const GUIDES_DIR = path.join(process.cwd(), 'content', 'guides');

export const TOPICS = [
  { id: 'deliverability', label: 'Spam and the inbox', blurb: 'Why email lands in spam, and how to get it out.' },
  { id: 'dns', label: 'Domain and DNS', blurb: 'SPF, DKIM, DMARC and blocklists.' },
  { id: 'smtp', label: 'Email accounts and SMTP', blurb: 'Settings, passwords and sending limits.' },
  { id: 'lists', label: 'Lists and bounces', blurb: 'Dead addresses, bounces and verification.' },
  { id: 'sending', label: 'Sending in bulk', blurb: 'Campaigns, limits and doing it safely.' },
  { id: 'tools', label: 'Using our tools', blurb: 'Each Trovarcis tool, step by step, and how to read what it shows.' },
];

export const ACTIONS = {
  domain: { label: 'Check your domain', href: '/domain', note: 'Free, no signup' },
  records: { label: 'Generate your records', href: '/records', note: 'Free, no signup' },
  smtp: { label: 'Test your SMTP settings', href: '/smtp-test', note: 'Free, nothing is sent' },
  verify: { label: 'Verify your list', href: '/verify', note: '1 cent per address, 10 free' },
  score: { label: 'Score your email', href: '/score', note: '1 cent per email, 10 free' },
  number: { label: 'Check phone numbers', href: '/verify-number', note: 'Format check free' },
  sender: { label: 'Get Sender', href: '/sender', note: 'One payment, 3 computers' },
};

const REQUIRED = ['title', 'description', 'short', 'published', 'checked', 'topic', 'action'];

function problems(slug, data, content) {
  const out = [];
  for (const key of REQUIRED) if (!data[key]) out.push(`missing ${key}`);
  if (data.description && data.description.length > 160) out.push('description over 160 characters');
  if (!TOPICS.some((t) => t.id === data.topic)) out.push(`unknown topic ${data.topic}`);
  if (!ACTIONS[data.action]) out.push(`unknown action ${data.action}`);
  for (const d of ['published', 'checked']) if (data[d] && !/^\d{4}-\d{2}-\d{2}$/.test(String(data[d]))) out.push(`${d} is not YYYY-MM-DD`);
  for (const s of data.sources || []) if (!/^.+ \| https:\/\/\S+$/.test(s)) out.push(`source not "Label | https://...": ${s}`);
  const all = `${data.title} ${data.short} ${data.description} ${data.slow || ''} ${content}`;
  if (all.includes('—')) out.push('em dash');
  if (/!(?!\[)/.test(all.replace(/<!--[\s\S]*?-->/g, ''))) out.push('exclamation mark');
  return out.map((p) => `${slug}: ${p}`);
}

function readingMinutes(text) {
  return Math.max(2, Math.round(text.split(/\s+/).length / 200));
}

let cache = null;

function load() {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  if (!fs.existsSync(GUIDES_DIR)) return (cache = []);
  const guides = [];
  for (const file of fs.readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(GUIDES_DIR, file), 'utf-8');
    const { data, content } = matter(raw);
    const slug = file.replace(/\.md$/, '');
    const bad = problems(slug, data, content);
    if (bad.length) {
      console.error(`[guides] left out: ${bad.join('; ')}`);
      continue;
    }
    guides.push({
      slug,
      title: data.title,
      nav: data.nav || null,
      description: data.description,
      short: fillPrices(data.short),
      published: String(data.published),
      checked: String(data.checked),
      topic: data.topic,
      action: data.action,
      asks: data.asks || [],
      needs: data.needs || [],
      sources: (data.sources || []).map((s) => {
        const [label, url] = s.split(' | ');
        return { label, url };
      }),
      related: data.related || [],
      post: data.post || null,
      order: typeof data.order === 'number' ? data.order : null,
      // A service we may offer: the guide shows a thumbs-up count for it (see interest.server.js).
      interest: /^[a-z0-9-]{1,40}$/.test(data.interest || '') ? data.interest : null,
      slow: data.slow ? fillPrices(data.slow) : null,
      minutes: readingMinutes(`${data.short} ${content}`),
      raw,
      content,
    });
  }
  guides.sort((a, b) => a.title.localeCompare(b.title));
  cache = guides;
  return guides;
}

const summary = ({ raw, content, ...g }) => g;

export function getAllGuides() {
  return load().map(summary);
}

// Topics with their guides, for the help desk's navigation. Guides keep their file order
// inside a topic when they set `order`, otherwise alphabetical.
export function getNav() {
  const guides = load();
  return TOPICS.map((t) => ({
    id: t.id,
    label: t.label,
    blurb: t.blurb,
    guides: guides
      .filter((g) => g.topic === t.id)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title))
      .map(({ slug, title, nav, description }) => ({ slug, title, nav, description })),
  })).filter((t) => t.guides.length);
}

export function getGuide(slug) {
  const g = load().find((x) => x.slug === slug);
  if (!g) return null;
  const html = labelTableCells(marked(fillPrices(g.content)));
  // Same ids as the heading renderer in markdown.server.js, so the step links land.
  const steps = [...g.content.matchAll(/^## (.+)$/gm)].map((m) => {
    const text = m[1].replace(/\s*\{#.+\}$/, '');
    const id = text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
    return { text, id };
  });
  const all = load();
  const related = g.related.map((s) => all.find((x) => x.slug === s)).filter(Boolean).map(summary);
  const posts = getAllPosts();
  const post = g.post ? posts.find((p) => p.slug === g.post) || null : null;
  return { ...summary(g), html, steps, related, post: post && { slug: post.slug, title: post.title } };
}

// The guide as Markdown, for AI tools and agents: the same file, with today's prices.
export function getGuideMarkdown(slug) {
  const g = load().find((x) => x.slug === slug);
  return g ? fillPrices(g.raw) : null;
}

const TOOLS = [
  { title: 'Domain Checker', url: '/domain', text: 'Check your domain setup and whether it is on a blocklist. Free.', asks: ['check my domain', 'domain health check', 'is my domain blacklisted', 'spf dkim dmarc check', 'blacklist check', 'domain tester'] },
  { title: 'DNS Generator', url: '/records', text: 'Get the SPF, DKIM and DMARC records for your email provider. Free.', asks: ['spf record generator', 'dmarc generator', 'dkim record', 'dns records for email'] },
  { title: 'SMTP Tester', url: '/smtp-test', text: 'Test your email account server, port and password. Free, sends nothing.', asks: ['test smtp', 'smtp connection test', 'smtp login failed', 'check smtp settings'] },
  { title: 'Email Verifier', url: '/verify', text: 'Find the addresses that would bounce, one at a time or a whole list. 1 cent each.', asks: ['verify email address', 'check if email is real', 'email list cleaning', 'bulk email verification'] },
  { title: 'Email Scorer', url: '/score', text: 'Score an email for spam out of 100, with what to fix. 1 cent each.', asks: ['spam score checker', 'will my email go to spam', 'spam test', 'spam words', 'unsubscribe link', 'email content check'] },
  { title: 'Phone Number Checker', url: '/verify-number', text: 'Check numbers are real and can receive texts before a bulk SMS.', asks: ['phone number validator', 'check phone number', 'landline or mobile', 'bulk sms list'] },
  { title: 'Bulk email cost calculator', url: '/bulk-email-cost-calculator', text: 'What Mailchimp, Brevo, Amazon SES and Trovarcis Sender cost over three years.', asks: ['bulk email cost', 'how much does it cost to send emails', 'cost to send 10000 emails', 'mailchimp too expensive', 'cheapest way to send bulk email', 'email marketing price'] },
  { title: 'Trovarcis Sender', url: '/sender', text: 'Send bulk email from your own computer through your own accounts. One payment.', asks: ['bulk email software', 'send mass email', 'mailchimp alternative', 'sendblaster alternative', 'one time payment email software'] },
];

// Everything the help desk can find: guides, tools, and blog posts as the full explanations.
export function getHelpIndex() {
  const guides = load().map((g) => ({ type: 'guide', title: g.title, url: `/guides/${g.slug}`, text: g.short, asks: g.asks, topic: g.topic }));
  const tools = TOOLS.map((t) => ({ type: 'tool', ...t }));
  const posts = getAllPosts().map((p) => ({ type: 'post', title: p.title, url: `/blog/${p.slug}`, text: p.description, asks: p.tags || [] }));
  return [...guides, ...tools, ...posts];
}
