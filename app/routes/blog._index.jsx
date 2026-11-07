// /blog - laid out like a printed front page. The lead story and the next four sit
// side by side, then every other post in a dense grid that widens with the screen.
// "Written for" filters by reader (churches, schools...), topics by category. Every
// filter and search is a URL, and the page works without JavaScript.

import { useEffect, useState } from 'react';
import { Form, Link, useLoaderData, useNavigate, useSearchParams } from 'react-router';
import { getAllPosts } from '~/utils/markdown.server';
import { getSeo } from '~/utils/seo';
import { formatDateShort } from '~/utils/format';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import BlogBanner from '~/components/blog/BlogBanner';
import { ArrowRightIcon } from '~/components/icons';
import styles from '~/styles/modules/routes/blog.module.css';

export const meta = () => getSeo({
  title: 'Blog',
  description: 'Plain answers for everyone who emails a list: newsletters, churches, schools and businesses. Sending in bulk, getting into the inbox, and choosing the right tools.',
  path: '/blog',
});

const PER_PAGE = 24;
const JUST_IN = 4;

export function loader() {
  const posts = getAllPosts().map(({ slug, title, description, date, category, audience, readingTime }) => ({
    slug, title, description, date, category, audience, readingTime,
  }));
  const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))];
  const audiences = [...new Set(posts.map((p) => p.audience).filter(Boolean))];
  return { posts, categories, audiences };
}

function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [...new Set([1, total, current, current - 1, current + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  pages.forEach((p, i) => {
    out.push(p);
    if (i < pages.length - 1 && pages[i + 1] - p > 1) out.push('gap');
  });
  return out;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Meta({ post }) {
  return (
    <span className={styles.meta}>
      {post.date && <time dateTime={post.date}>{formatDateShort(post.date)}</time>}
      <span className={styles.metaDot} aria-hidden="true" />
      <span>{post.readingTime} min</span>
    </span>
  );
}

function Kicker({ post }) {
  return (
    <span className={styles.kicker}>
      {post.audience ? <>For {post.audience.toLowerCase()}</> : post.category}
    </span>
  );
}

function Lead({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className={styles.lead}>
      <span className={styles.leadBanner}>
        <BlogBanner slug={post.slug} category={post.category} height={220} variant="full" />
        <span className={styles.leadStamp}>Latest</span>
      </span>
      <span className={styles.leadBody}>
        <Kicker post={post} />
        <span className={styles.leadTitle}>{post.title}</span>
        <span className={styles.leadText}>{post.description}</span>
        <span className={styles.leadFoot}>
          <Meta post={post} />
          <span className={styles.leadRead}>Read <ArrowRightIcon size={14} /></span>
        </span>
      </span>
    </Link>
  );
}

function Card({ post }) {
  return (
    <li>
      <Link to={`/blog/${post.slug}`} className={styles.card}>
        <span className={styles.cardBanner} aria-hidden="true">
          <BlogBanner slug={post.slug} category={post.category} height={64} />
        </span>
        <span className={styles.cardBody}>
          <Kicker post={post} />
          <span className={styles.cardTitle}>{post.title}</span>
          <span className={styles.cardText}>{post.description}</span>
          <Meta post={post} />
        </span>
      </Link>
    </li>
  );
}

export default function BlogIndex() {
  const { posts, categories, audiences } = useLoaderData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const category = searchParams.get('category') || '';
  const audience = searchParams.get('for') || '';
  const query = (searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [typed, setTyped] = useState(query);
  // "Show all" and the back button change the URL without typing; keep the box in step.
  useEffect(() => { setTyped((t) => (t.trim() === query ? t : query)); }, [query]);

  let filtered = posts;
  if (audience) filtered = filtered.filter((p) => p.audience === audience);
  if (category) filtered = filtered.filter((p) => p.category === category);
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((p) => `${p.title} ${p.description} ${p.audience}`.toLowerCase().includes(q));
  }

  const isFront = !audience && !category && !query && page === 1;
  const lead = isFront ? filtered[0] : null;
  const justIn = isFront ? filtered.slice(1, 1 + JUST_IN) : [];
  const pool = isFront ? filtered.slice(1 + JUST_IN) : filtered;

  const totalPages = Math.max(1, Math.ceil(pool.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const shown = pool.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const href = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    const s = next.toString();
    return s ? `/blog?${s}` : '/blog';
  };

  const onSearch = (e) => {
    setTyped(e.target.value);
    navigate(href({ q: e.target.value.trim() }), { replace: true, preventScrollReset: true });
  };

  const filtering = audience || category || query;

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.wrap}`}>
          <header className={styles.masthead}>
            <div className={styles.mastText}>
              <p className={styles.mastKicker}><span className={styles.mastRule} aria-hidden="true" />The Trovarcis blog &middot; {posts.length} posts</p>
              <h1 className={styles.heading}>Blog</h1>
              <p className={styles.subtitle}>Plain answers for everyone who emails a list: what to send from, what it costs, and how to land in the inbox.</p>
            </div>
            <Form method="get" action="/blog" role="search" className={styles.search} onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="blog-q" className={styles.visuallyHidden}>Search posts</label>
              <span className={styles.searchIcon}><SearchIcon /></span>
              <input
                id="blog-q"
                name="q"
                type="search"
                value={typed}
                onChange={onSearch}
                placeholder="Search posts…"
                autoComplete="off"
                className={styles.searchInput}
              />
              {audience && <input type="hidden" name="for" value={audience} />}
              {category && <input type="hidden" name="category" value={category} />}
            </Form>
          </header>

          <nav className={styles.filters} aria-label="Filter posts">
            {audiences.length > 0 && (
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>Written for</span>
                <ul className={styles.chips}>
                  {audiences.map((a) => (
                    <li key={a}>
                      <Link to={href({ for: audience === a ? '' : a })} className={`${styles.chip} ${audience === a ? styles.chipOn : ''}`} aria-current={audience === a ? 'true' : undefined} preventScrollReset>
                        {a}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.filterRow}>
              <span className={styles.filterLabel}>Topics</span>
              <ul className={styles.chips}>
                {categories.map((c) => (
                  <li key={c}>
                    <Link to={href({ category: category === c ? '' : c })} className={`${styles.chip} ${category === c ? styles.chipOn : ''}`} aria-current={category === c ? 'true' : undefined} preventScrollReset>
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {filtering && (
            <p className={styles.results} role="status">
              {filtered.length} {filtered.length === 1 ? 'post' : 'posts'}
              {audience && <> for <strong>{audience.toLowerCase()}</strong></>}
              {category && <> in <strong>{category}</strong></>}
              {query && <> matching <strong>{query}</strong></>}
              <Link to="/blog" className={styles.reset}>Show all</Link>
            </p>
          )}

          {lead && (
            <section className={styles.front} aria-label="Latest posts">
              <Lead post={lead} />
              {justIn.length > 0 && (
                <div className={styles.justIn}>
                  <h2 className={styles.sectionLabel}>Just in</h2>
                  <ol className={styles.justList}>
                    {justIn.map((p, i) => (
                      <li key={p.slug}>
                        <Link to={`/blog/${p.slug}`} className={styles.justItem}>
                          <span className={styles.justNum} aria-hidden="true">{String(i + 2).padStart(2, '0')}</span>
                          <span className={styles.justBody}>
                            <Kicker post={p} />
                            <span className={styles.justTitle}>{p.title}</span>
                            <Meta post={p} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          {shown.length > 0 && (
            <section className={styles.all} aria-labelledby="all-posts">
              {isFront && <h2 id="all-posts" className={styles.allHead}>More posts</h2>}
              {!isFront && <h2 id="all-posts" className={styles.visuallyHidden}>Posts</h2>}
              <ul className={styles.grid}>
                {shown.map((p) => <Card key={p.slug} post={p} />)}
              </ul>
            </section>
          )}

          {filtered.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No posts match that yet.</p>
              <p className={styles.emptyText}>
                Try other words, or ask the <Link to={`/guides?q=${encodeURIComponent(query)}`}>help desk</Link>, which answers short questions.
              </p>
            </div>
          )}

          {totalPages > 1 && (
            <nav className={styles.pager} aria-label="More pages">
              {current > 1 && <Link to={href({ page: String(current - 1) })} className={styles.pageArrow} aria-label="Newer posts">Newer</Link>}
              {pageWindow(current, totalPages).map((p, i) => (p === 'gap'
                ? <span key={`g${i}`} className={styles.pageGap}>…</span>
                : <Link key={p} to={href({ page: p === 1 ? '' : String(p) })} className={p === current ? styles.pageOn : styles.pageNum} aria-current={p === current ? 'page' : undefined}>{p}</Link>))}
              {current < totalPages && <Link to={href({ page: String(current + 1) })} className={styles.pageArrow} aria-label="Older posts">Older</Link>}
            </nav>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
