import { Link, useLoaderData, useSearchParams } from 'react-router';
import { getAllPosts } from '~/utils/markdown.server';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import { formatDateShort } from '~/utils/format';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import BlogCard from '~/components/blog/BlogCard';
import BlogBanner from '~/components/blog/BlogBanner';
import { ArrowRightIcon } from '~/components/icons';
import styles from '~/styles/modules/routes/blog.module.css';

export const meta = () => getSeo({
  title: 'Blog',
  description: 'Guides, tutorials, and insights on email deliverability, SMTP configuration, and bulk email best practices.',
  path: '/blog',
});

export function loader() {
  const posts = getAllPosts();
  const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))];
  return { posts, categories };
}

const PER_PAGE = 12;

/* Compact page-number window. Returns [1, 2, '...', 6, '...', 12]-style array. */
function getPageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push('gap');
  }
  return out;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FeaturedCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className={styles.featuredCard}>
      <div className={styles.featuredBanner}>
        <BlogBanner slug={post.slug} category={post.category} height={280} variant="full" />
      </div>
      <div className={styles.featuredBody}>
        <span className={styles.featuredTag}>Latest</span>
        {post.category && <span className={styles.featuredCategory}>{post.category}</span>}
        <h2 className={styles.featuredTitle}>{post.title}</h2>
        {post.description && <p className={styles.featuredDescription}>{post.description}</p>}
        <div className={styles.featuredMeta}>
          {post.date && <time dateTime={post.date}>{formatDateShort(post.date)}</time>}
          {post.readingTime && (
            <>
              <span className={styles.metaDot} aria-hidden="true" />
              <span>{post.readingTime} min read</span>
            </>
          )}
          <span className={styles.featuredRead}>
            Read article
            <ArrowRightIcon size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function BlogIndex() {
  const { posts, categories } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const headerRef = useReveal();

  const activeCategory = searchParams.get('category') || 'All';
  const query = searchParams.get('q') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  /* Filter chain: category first, then text search. */
  let filtered = posts;
  if (activeCategory !== 'All') {
    filtered = filtered.filter((p) => p.category === activeCategory);
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }

  /* Featured slot only on the default view (no filter, no search, page 1). */
  const isDefaultView = activeCategory === 'All' && !query.trim() && page === 1;
  const featured = isDefaultView && filtered.length > 0 ? filtered[0] : null;
  const gridPool = featured ? filtered.slice(1) : filtered;

  const totalPages = Math.max(1, Math.ceil(gridPool.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PER_PAGE;
  const pagePosts = gridPool.slice(pageStart, pageStart + PER_PAGE);

  function updateParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'All' && value !== '') next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: false });
  }

  function resetFilters() {
    setSearchParams(new URLSearchParams(), { replace: false });
  }

  const hasActiveFilter = activeCategory !== 'All' || query.trim() !== '';
  const pageWindow = totalPages > 1 ? getPageWindow(safePage, totalPages) : [];

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container">
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <h1 className={styles.heading}>Blog</h1>
            <p className={styles.subtitle}>
              Guides and insights on email deliverability, SMTP configuration, and sending email at scale.
            </p>
          </header>

          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}><SearchIcon /></span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search posts"
                value={query}
                onChange={(e) => updateParam('q', e.target.value)}
                aria-label="Search blog posts"
              />
              {query && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => updateParam('q', '')}
                  aria-label="Clear search"
                >
                  <ClearIcon />
                </button>
              )}
            </div>

            {categories.length > 0 && (
              <div className={styles.filters}>
                <button
                  className={`${styles.filterPill} ${activeCategory === 'All' ? styles.filterActive : ''}`}
                  onClick={() => updateParam('category', 'All')}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`${styles.filterPill} ${activeCategory === cat ? styles.filterActive : ''}`}
                    onClick={() => updateParam('category', cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasActiveFilter && (
            <div className={styles.resultsBar}>
              <span>
                {filtered.length} {filtered.length === 1 ? 'post' : 'posts'}
                {query.trim() && <> matching <strong>{query.trim()}</strong></>}
                {activeCategory !== 'All' && <> in <strong>{activeCategory}</strong></>}
              </span>
              <button onClick={resetFilters} className={styles.resetFilters}>Reset</button>
            </div>
          )}

          {featured && <FeaturedCard post={featured} />}

          {pagePosts.length > 0 ? (
            <div className={styles.grid}>
              {pagePosts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No posts match</p>
              <p className={styles.emptyHelper}>
                Try a different search or reset the filters.
              </p>
              {hasActiveFilter && (
                <button onClick={resetFilters} className={styles.emptyAction}>
                  Reset filters
                </button>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <nav className={styles.pager} aria-label="Pagination">
              <button
                className={styles.pageArrow}
                onClick={() => updateParam('page', String(safePage - 1))}
                disabled={safePage === 1}
                aria-label="Previous page"
              >
                ←
              </button>
              {pageWindow.map((p, i) =>
                p === 'gap' ? (
                  <span key={`gap-${i}`} className={styles.pageGap}>…</span>
                ) : (
                  <button
                    key={p}
                    className={p === safePage ? styles.pageNumActive : styles.pageNum}
                    onClick={() => updateParam('page', String(p))}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                className={styles.pageArrow}
                onClick={() => updateParam('page', String(safePage + 1))}
                disabled={safePage === totalPages}
                aria-label="Next page"
              >
                →
              </button>
            </nav>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
