// The help desk search. Shared by the server (so ?q= works without JavaScript and can be
// linked) and the browser (results as you type). Plain word matching with a few synonyms:
// no AI, no outside service, and nothing a visitor types leaves the page except the
// anonymous count of searches that found nothing.

const STOP = new Set('a an and are as at be by can do does for from get how i if in is it my of on or so the to what when where which why will with you your me we our this that there their its'.split(' '));

// Words people use for the same thing. Each group is matched as one word.
const SAME = [
  ['blacklist', 'blacklisted', 'blocklist', 'blocklisted', 'blocked', 'listed', 'delist', 'rbl', 'spamhaus'],
  ['spam', 'junk', 'promotions'],
  ['bounce', 'bounced', 'bounces', 'undeliverable', 'returned'],
  ['limit', 'limits', 'quota', 'cap', 'maximum'],
  ['password', 'login', 'sign', 'auth', 'authentication', '535'],
  ['verify', 'verification', 'validate', 'clean', 'cleaning', 'invalid'],
  ['list', 'contacts', 'addresses'],
  ['smtp', 'server', 'port'],
  ['dkim', 'signature', 'signed'],
  ['send', 'sending', 'sent', 'bulk', 'mass', 'campaign', 'newsletter'],
  ['cost', 'price', 'pricing', 'cheap', 'expensive', 'pay'],
  ['phone', 'number', 'numbers', 'sms', 'text', 'mobile'],
  ['gmail', 'google', 'workspace'],
];
const GROUP = new Map();
SAME.forEach((words, i) => words.forEach((w) => GROUP.set(w, `g${i}`)));

function stem(word) {
  if (GROUP.has(word)) return GROUP.get(word);
  let w = word;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return GROUP.get(w) || w;
}

export function terms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9.@_\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

/**
 * docs: [{ type, title, url, text, asks: [] }]
 * Returns the best matches, guides first when scores tie.
 */
export function search(docs, query, limit = 8) {
  const q = terms(query);
  if (!q.length) return [];
  const phrase = String(query).toLowerCase().trim();
  const rank = { guide: 3, tool: 2, post: 1 };

  return docs
    .map((doc) => {
      const title = new Set(terms(doc.title));
      const asks = new Set((doc.asks || []).flatMap(terms));
      const body = new Set(terms(doc.text));
      let score = 0;
      let hit = 0;
      for (const t of q) {
        const s = (title.has(t) ? 4 : 0) + (asks.has(t) ? 3 : 0) + (body.has(t) ? 1 : 0);
        if (s) hit += 1;
        score += s;
      }
      // A long question has to be mostly matched, or it isn't really answered.
      if (!hit || (q.length >= 3 && hit / q.length < 0.5)) return null;
      score *= hit / q.length;
      if (phrase.length > 6 && [doc.title, ...(doc.asks || [])].some((a) => a.toLowerCase().includes(phrase))) score += 6;
      return { ...doc, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || rank[b.type] - rank[a.type])
    .slice(0, limit);
}
