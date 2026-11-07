// /guides - the help desk. Every guide in the left column, the question box and the answers
// in the main column. Ask in your own words, or paste an error message: answers come from
// the guides, the tools and the blog's full explanations, and a pasted server error is
// explained on the spot. Works without JavaScript (?q=); every search has a URL.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import GuideNav from '~/components/guides/GuideNav';
import { getSeo } from '~/utils/seo';
import { getHelpIndex, getNav } from '~/utils/guides.server';
import { search } from '~/utils/helpSearch';
import { decode } from '~/utils/smtpCodes';
import styles from '~/styles/modules/routes/guides.module.css';

const POPULAR = [
  'Why are my emails going to spam?',
  'Gmail SMTP settings',
  'My domain is blacklisted',
  '535 5.7.139 Authentication unsuccessful',
  'What does a bounce mean?',
];

const START = ['find-why-emails-go-to-spam', 'gmail-smtp-settings', 'remove-from-blocklist'];

const TYPE_LABEL = { guide: 'Guide', tool: 'Tool', post: 'Full explanation' };

export const meta = () => {
  const tags = getSeo({
    title: 'Help desk: email how-to guides',
    description: 'Ask a question or paste an error about sending email, SPF, DKIM, DMARC, blocklists, bounces or SMTP, and get the short answer with the steps.',
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
  const q = (new URL(request.url).searchParams.get('q') || '').slice(0, 200);
  const index = getHelpIndex();
  const nav = getNav();
  const all = nav.flatMap((t) => t.guides);
  const start = START.map((s) => all.find((g) => g.slug === s)).filter(Boolean);
  return { q, index, nav, start, count: all.length };
}

// Only the shape of a question is kept: no addresses, no long numbers.
function clean(q) {
  return q.replace(/\S+@\S+/g, '[email]').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[ip]').replace(/\d{6,}/g, '#').slice(0, 120);
}
function track(metadata) {
  try { window.__trovTrack?.('help_search', metadata); } catch { /* never blocks the page */ }
}

export default function HelpDesk() {
  const { q: initialQ, index, nav, start, count } = useLoaderData();
  const [q, setQ] = useState(initialQ);
  const query = q.trim();
  const results = useMemo(() => (query ? search(index, query) : []), [query, index]);
  const decoded = useMemo(() => (query ? decode(query) : null), [query]);
  const inputRef = useRef(null);

  // Record a question once the visitor stops typing, so we learn which guides are missing.
  useEffect(() => {
    if (query.length < 4) return undefined;
    const timer = setTimeout(() => track({ q: clean(query), n: results.length + (decoded ? 1 : 0) }), 1500);
    return () => clearTimeout(timer);
  }, [query, results.length, decoded]);

  useEffect(() => {
    const next = query ? `?q=${encodeURIComponent(query)}` : window.location.pathname;
    window.history.replaceState(window.history.state, '', next);
  }, [query]);

  const ask = (text) => (event) => {
    event.preventDefault();
    setQ(text);
    inputRef.current?.focus();
  };

  const opened = (r, i) => () => track({ q: clean(query), go: r.url, rank: i + 1 });

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={`container ${styles.layout}`}>
          <aside className={styles.side}>
            <GuideNav topics={nav} />
          </aside>

          <div className={styles.content}>
            <section className={styles.desk} aria-labelledby="desk-title">
              <p className={styles.kicker}><span className={styles.kickerRule} aria-hidden="true" />Help desk &middot; {count} guides</p>
              <h1 id="desk-title" className={styles.headline}>How can we help?</h1>
              <p className={styles.sub}>Ask in your own words, or paste the error your email came back with.</p>

              <Form method="get" role="search" className={styles.askForm} onSubmit={(e) => e.preventDefault()}>
                <label htmlFor="ask" className={styles.visuallyHidden}>Ask a question or paste an error</label>
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
                  spellCheck={false}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-controls="answers"
                />
                <button type="submit" className={styles.askButton}>Ask</button>
              </Form>

              {!query && (
                <ul className={styles.popular} aria-label="Common questions">
                  {POPULAR.map((p) => (
                    <li key={p}>
                      <a href={`/guides?q=${encodeURIComponent(p)}`} className={styles.chip} onClick={ask(p)}>{p}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div id="answers" className={styles.answers} aria-live="polite">
              {decoded && (
                <section className={`${styles.decoded} ${styles[`decoded_${decoded.kind?.tone || 'info'}`]}`} aria-label="What this error means">
                  <div className={styles.decodedHead}>
                    <span className={styles.decodedCode}>{decoded.code}</span>
                    {decoded.kind && <span className={styles.decodedKind}>{decoded.kind.word}</span>}
                  </div>
                  <p className={styles.decodedTitle}>{decoded.title}</p>
                  {decoded.means && <p className={styles.decodedText}>{decoded.means}</p>}
                  <p className={styles.decodedTodo}><strong>What to do:</strong> {decoded.todo}</p>
                  {decoded.guide && (
                    <Link to={decoded.guide} className={styles.decodedLink} onClick={opened({ url: decoded.guide }, -1)}>Read the guide</Link>
                  )}
                </section>
              )}

              {query && results.length > 0 && (
                <ol className={styles.answerList}>
                  {results.map((r, i) => (
                    <li key={r.url}>
                      <Link to={r.url} className={`${styles.answer} ${r.type === 'guide' ? styles.answerGuide : ''}`} onClick={opened(r, i)}>
                        <span className={styles.answerType}>{TYPE_LABEL[r.type]}</span>
                        <span className={styles.answerTitle}>{r.title}</span>
                        <span className={styles.answerText}>{r.text}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}

              {query && results.length === 0 && !decoded && (
                <div className={styles.none}>
                  <p className={styles.noneTitle}>No guide answers that yet.</p>
                  <p className={styles.noneText}>
                    We read the questions asked here and write guides for the common ones. Need an answer now? <Link to="/contact">Ask us</Link>.
                  </p>
                </div>
              )}
            </div>

            {!query && (
              <>
                <section className={styles.start} aria-labelledby="start-title">
                  <h2 id="start-title" className={styles.sectionLabel}>Start here</h2>
                  <ul className={styles.startList}>
                    {start.map((g) => (
                      <li key={g.slug}>
                        <Link to={`/guides/${g.slug}`} className={styles.startCard}>
                          <span className={styles.startTitle}>{g.title}</span>
                          <span className={styles.startText}>{g.description}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>

                {nav.map((t) => (
                  <section key={t.id} className={styles.topic} aria-labelledby={`t-${t.id}`}>
                    <div className={styles.topicHead}>
                      <h2 id={`t-${t.id}`} className={styles.topicTitle}>{t.label}</h2>
                      <p className={styles.topicBlurb}>{t.blurb}</p>
                    </div>
                    <ul className={styles.topicList}>
                      {t.guides.map((g) => (
                        <li key={g.slug}>
                          <Link to={`/guides/${g.slug}`} className={styles.topicLink}>
                            <span className={styles.topicLinkTitle}>{g.title}</span>
                            <span className={styles.topicLinkText}>{g.description}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}

                <section className={styles.more} aria-label="Other help">
                  <p className={styles.moreText}>
                    Want the whole story? <Link to="/blog">The blog</Link> explains each topic in full. Still stuck? <Link to="/contact">Write to us</Link>; a person answers, usually within one business day.
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
