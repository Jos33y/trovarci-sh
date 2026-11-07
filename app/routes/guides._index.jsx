// /guides - the help desk. Ask in your own words; answers come from the guides, the tools
// and the blog's full explanations. Searching works without JavaScript (?q=) and every
// search has a URL; with JavaScript the answers appear as you type.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSeo } from '~/utils/seo';
import { getAllGuides, getHelpIndex, TOPICS } from '~/utils/guides.server';
import { search } from '~/utils/helpSearch';
import styles from '~/styles/modules/routes/guides.module.css';

const POPULAR = [
  'Why are my emails going to spam?',
  'Gmail SMTP settings',
  'How many emails can I send a day from Gmail?',
  'My domain is blacklisted',
  'What does a bounce mean?',
];

const TYPE_LABEL = { guide: 'Guide', tool: 'Tool', post: 'Full explanation' };

export const meta = () => {
  const tags = getSeo({
    title: 'Help desk: email how-to guides',
    description: 'Ask a question about sending email, SPF, DKIM, DMARC, blocklists, bounces or SMTP settings, and get the short answer with the steps.',
    path: '/guides',
  });
  tags.push({
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Trovarcis help desk',
      url: 'https://trovarci.sh/guides',
      description: 'Short how-to guides for sending email that reaches the inbox.',
    },
  });
  return tags;
};

export function loader({ request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').slice(0, 120);
  const index = getHelpIndex();
  const guides = getAllGuides();
  const topics = TOPICS.map((t) => ({ ...t, guides: guides.filter((g) => g.topic === t.id).map(({ slug, title, minutes }) => ({ slug, title, minutes })) }))
    .filter((t) => t.guides.length);
  return { q, index, topics, count: guides.length, initial: q ? search(index, q) : [] };
}

// Only the shape of what people ask is kept: no addresses, no numbers.
function track(q, n) {
  const clean = q.replace(/\S+@\S+/g, '[email]').replace(/\d{3,}/g, '#').slice(0, 120);
  try { window.__trovTrack?.('help_search', { q: clean, n }); } catch { /* never blocks the page */ }
}

export default function HelpDesk() {
  const { q: initialQ, index, topics, count, initial } = useLoaderData();
  const [q, setQ] = useState(initialQ);
  const results = useMemo(() => (q.trim() ? search(index, q) : []), [q, index]);
  const shown = q === initialQ ? initial : results;
  const inputRef = useRef(null);

  // Record a search once the visitor stops typing, so we learn which questions need a guide.
  useEffect(() => {
    const value = q.trim();
    if (value.length < 4) return undefined;
    const timer = setTimeout(() => track(value, results.length), 1500);
    return () => clearTimeout(timer);
  }, [q, results.length]);

  useEffect(() => {
    const next = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : window.location.pathname;
    window.history.replaceState(window.history.state, '', next);
  }, [q]);

  const ask = (text) => (event) => {
    event.preventDefault();
    setQ(text);
    inputRef.current?.focus();
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <section className={styles.desk} aria-labelledby="desk-title">
            <p className={styles.kicker}><span className={styles.kickerRule} aria-hidden="true" />Help desk</p>
            <h1 id="desk-title" className={styles.headline}>How can we help?</h1>
            <p className={styles.sub}>Ask in your own words. You get the short answer and the steps.</p>

            <Form method="get" role="search" className={styles.askForm} onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="ask" className={styles.visuallyHidden}>Ask a question</label>
              <svg className={styles.askIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
              <input
                ref={inputRef}
                id="ask"
                name="q"
                type="search"
                className={styles.ask}
                placeholder="Why are my emails going to spam?"
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-controls="answers"
              />
              <button type="submit" className={styles.askButton}>Ask</button>
            </Form>

            <div id="answers" className={styles.answers} aria-live="polite">
              {q.trim() && shown.length > 0 && (
                <ol className={styles.answerList}>
                  {shown.map((r) => (
                    <li key={r.url}>
                      <Link to={r.url} className={`${styles.answer} ${r.type === 'guide' ? styles.answerGuide : ''}`}>
                        <span className={styles.answerType}>{TYPE_LABEL[r.type]}</span>
                        <span className={styles.answerTitle}>{r.title}</span>
                        <span className={styles.answerText}>{r.text}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              {q.trim() && shown.length === 0 && (
                <div className={styles.none}>
                  <p className={styles.noneTitle}>No guide answers that yet.</p>
                  <p className={styles.noneText}>
                    We read every question asked here and write guides for the common ones. Need an answer now?{' '}
                    <Link to="/contact">Ask us</Link>.
                  </p>
                </div>
              )}
              {!q.trim() && (
                <div className={styles.popular}>
                  <span className={styles.popularLabel}>People ask</span>
                  <ul className={styles.popularList}>
                    {POPULAR.map((p) => (
                      <li key={p}>
                        <a href={`/guides?q=${encodeURIComponent(p)}`} className={styles.chip} onClick={ask(p)}>{p}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className={styles.shelf} aria-labelledby="topics-title">
            <div className={styles.shelfHead}>
              <h2 id="topics-title" className={styles.shelfTitle}>Every guide, by topic</h2>
              <span className={styles.shelfCount}>{count} guides</span>
            </div>
            <div className={styles.topics}>
              {topics.map((t, i) => (
                <section key={t.id} className={styles.topic} aria-labelledby={`t-${t.id}`}>
                  <span className={styles.topicNum} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <h3 id={`t-${t.id}`} className={styles.topicTitle}>{t.label}</h3>
                  <p className={styles.topicBlurb}>{t.blurb}</p>
                  <ul className={styles.topicList}>
                    {t.guides.map((g) => (
                      <li key={g.slug}>
                        <Link to={`/guides/${g.slug}`} className={styles.topicLink}>
                          <span>{g.title}</span>
                          <span className={styles.topicMin}>{g.minutes} min</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>

          <section className={styles.more} aria-label="Other help">
            <div className={styles.moreItem}>
              <h2 className={styles.moreTitle}>Want the whole story?</h2>
              <p className={styles.moreText}>The blog explains each topic in full, with the reasons behind every step.</p>
              <Link to="/blog" className={styles.moreLink}>Read the blog</Link>
            </div>
            <div className={styles.moreItem}>
              <h2 className={styles.moreTitle}>Still stuck?</h2>
              <p className={styles.moreText}>Write to us with what you tried. A person answers, usually within one business day.</p>
              <Link to="/contact" className={styles.moreLink}>Contact us</Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
