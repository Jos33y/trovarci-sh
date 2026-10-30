// Groups a referrer domain or utm_source into a traffic source for the admin reports.

const RULES = [
  { group: 'Google', kind: 'search', test: (d) => /(^|\.)google\.[a-z.]+$/.test(d) },
  { group: 'Bing', kind: 'search', test: (d) => /(^|\.)bing\.com$/.test(d) },
  { group: 'DuckDuckGo', kind: 'search', test: (d) => /(^|\.)duckduckgo\.com$/.test(d) },
  { group: 'Yandex', kind: 'search', test: (d) => /(^|\.)yandex\.[a-z.]+$/.test(d) },
  { group: 'Other search', kind: 'search', test: (d) => /(^|\.)(yahoo|ecosia|brave|search\.brave|qwant|startpage|naver|baidu|seznam|mojeek)\.[a-z.]+$/.test(d) },
  { group: 'ChatGPT', kind: 'ai', test: (d) => /(^|\.)(chatgpt(\.com)?|chat\.openai\.com|openai\.com)$/.test(d) },
  { group: 'Perplexity', kind: 'ai', test: (d) => /(^|\.)perplexity\.ai$/.test(d) },
  { group: 'Copilot', kind: 'ai', test: (d) => /(^|\.)copilot\.microsoft\.com$/.test(d) },
  { group: 'Gemini', kind: 'ai', test: (d) => /(^|\.)gemini\.google\.com$/.test(d) },
  { group: 'Claude', kind: 'ai', test: (d) => /(^|\.)claude\.ai$/.test(d) },
  { group: 'Reddit', kind: 'social', test: (d) => /(^|\.)reddit\.com$/.test(d) },
  { group: 'X', kind: 'social', test: (d) => /(^|\.)(x\.com|twitter\.com|t\.co)$/.test(d) },
  { group: 'LinkedIn', kind: 'social', test: (d) => /(^|\.)(linkedin(\.com)?|lnkd\.in)$/.test(d) },
  { group: 'YouTube', kind: 'social', test: (d) => /(^|\.)youtube\.com$/.test(d) },
  { group: 'SaaSHub', kind: 'directory', test: (d) => /(^|\.)saashub(\.com)?$/.test(d) },
  { group: 'Capterra', kind: 'directory', test: (d) => /(^|\.)(capterra(\.[a-z.]+)?|getapp\.com|softwareadvice\.com)$/.test(d) },
  { group: 'G2', kind: 'directory', test: (d) => /(^|\.)g2(\.com)?$/.test(d) },
  { group: 'AlternativeTo', kind: 'directory', test: (d) => /(^|\.)alternativeto(\.net)?$/.test(d) },
  { group: 'Crunchbase', kind: 'directory', test: (d) => /(^|\.)crunchbase(\.com)?$/.test(d) },
  { group: 'Product Hunt', kind: 'directory', test: (d) => /(^|\.)producthunt(\.com)?$/.test(d) },
];

// Gemini is checked before Google so gemini.google.com is not counted as search.
const ORDERED = [...RULES.filter((r) => r.group === 'Gemini'), ...RULES.filter((r) => r.group !== 'Gemini')];

export function classifySource(source) {
  if (!source) return { group: 'Direct', kind: 'direct' };
  const d = String(source).toLowerCase().trim().replace(/^www\./, '');
  for (const r of ORDERED) {
    if (r.test(d)) return { group: r.group, kind: r.kind };
  }
  return { group: d, kind: 'other' };
}
