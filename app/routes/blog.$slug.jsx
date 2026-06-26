import { useLoaderData, Link, data } from 'react-router';
import { getPost, getAdjacentPosts, getRelatedPosts } from '~/utils/markdown.server';
import { formatDate, formatDateShort } from '~/utils/format';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import BlogContent from '~/components/blog/BlogContent';
import BlogBanner from '~/components/blog/BlogBanner';
import BlogCard from '~/components/blog/BlogCard';
import { ArrowLeftIcon, ArrowRightIcon } from '~/components/icons';
import styles from '~/styles/modules/routes/blogPost.module.css';

export function meta({ data: payload }) {
  const post = payload?.post;
  if (!post) {
    return getSeo({ title: 'Post not found', path: '/blog' });
  }
  return [
    ...getSeo({
      title: post.title,
      description: post.description,
      path: `/blog/${post.slug}`,
    }),
    { property: 'og:type', content: 'article' },
    { property: 'article:published_time', content: post.date },
    { property: 'article:author', content: post.author },
  ];
}

export function loader({ params }) {
  const post = getPost(params.slug);
  if (!post) {
    throw data(null, { status: 404, statusText: 'Post not found' });
  }
  const { prev, next } = getAdjacentPosts(params.slug);
  const related = getRelatedPosts(params.slug, 3);
  return { post, prev, next, related };
}

export default function BlogPost() {
  const { post, prev, next, related } = useLoaderData();
  const headerRef = useReveal();
  const contentRef = useReveal(0.01);
  const ctaRef = useReveal();

  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: 'Trovarcis', url: 'https://trovarcis.com' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://trovarci.sh/blog/${post.slug}` },
  };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />

        <div className={styles.bannerWrap}>
          <BlogBanner slug={post.slug} category={post.category} height={160} variant="full" />
        </div>

        <div className={`container ${styles.inner}`}>
          <Link to="/blog" className={styles.back}>
            <ArrowLeftIcon size={14} />
            All posts
          </Link>

          <article>
            <header ref={headerRef} className={`${styles.articleHeader} reveal`}>
              {post.category && (
                <Link
                  to={`/blog?category=${encodeURIComponent(post.category)}`}
                  className={styles.category}
                >
                  {post.category}
                </Link>
              )}

              <h1 className={styles.title}>{post.title}</h1>

              <div className={styles.meta}>
                {post.date && <time dateTime={post.date}>{formatDate(post.date)}</time>}
                <span className={styles.dot} aria-hidden="true" />
                <span>{post.readingTime} min read</span>
                <span className={styles.dot} aria-hidden="true" />
                <span>{post.author}</span>
              </div>
            </header>

            <hr className={styles.divider} />

            <div ref={contentRef} className="reveal">
              <BlogContent html={post.html} />
            </div>
          </article>

          {post.tags && post.tags.length > 0 && (
            <div className={styles.tags}>
              {post.tags.map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          )}

          {(prev || next) && (
            <nav className={styles.prevNext} aria-label="Adjacent posts">
              {prev ? (
                <Link to={`/blog/${prev.slug}`} className={styles.adjCard}>
                  <span className={styles.adjLabel}>
                    <ArrowLeftIcon size={12} />
                    Previous
                  </span>
                  <span className={styles.adjTitle}>{prev.title}</span>
                  {prev.date && (
                    <time className={styles.adjDate} dateTime={prev.date}>
                      {formatDateShort(prev.date)}
                    </time>
                  )}
                </Link>
              ) : (
                <span className={styles.adjEmpty} />
              )}
              {next ? (
                <Link to={`/blog/${next.slug}`} className={`${styles.adjCard} ${styles.adjNext}`}>
                  <span className={styles.adjLabel}>
                    Next
                    <ArrowRightIcon size={12} />
                  </span>
                  <span className={styles.adjTitle}>{next.title}</span>
                  {next.date && (
                    <time className={styles.adjDate} dateTime={next.date}>
                      {formatDateShort(next.date)}
                    </time>
                  )}
                </Link>
              ) : (
                <span className={styles.adjEmpty} />
              )}
            </nav>
          )}

          {related.length > 0 && (
            <section className={styles.related} aria-label="Related posts">
              <h2 className={styles.relatedTitle}>Keep reading</h2>
              <div className={styles.relatedGrid}>
                {related.map((p) => (
                  <BlogCard key={p.slug} post={p} />
                ))}
              </div>
            </section>
          )}

          <aside ref={ctaRef} className={`${styles.bottomCta} reveal`}>
            <span className={styles.bottomCtaIcon} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l2-2h14l2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className={styles.bottomCtaEyebrow}>Trovarcis Reach Desktop</p>
            <h2 className={styles.bottomCtaHeading}>Bulk email from your own machine</h2>
            <p className={styles.bottomCtaText}>
              One-time purchase. Runs offline. Multi-SMTP failover, AI scoring, contacts that never leave your machine. Launching mid-July 2026.
            </p>
            <div className={styles.bottomCtaActions}>
              <a href="/#cta" className={styles.bottomCtaButton}>
                Get Early Access
                <ArrowRightIcon size={14} />
              </a>
              <Link to="/score" className={styles.bottomCtaSecondary}>
                Try the web tools
              </Link>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
