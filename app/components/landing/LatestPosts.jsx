import { Link } from 'react-router';
import useReveal from '~/utils/useReveal';
import { formatDateShort } from '~/utils/format';
import { ArrowRightIcon } from '~/components/icons';
import BlogBanner from '~/components/blog/BlogBanner';
import styles from '~/styles/modules/landing/LatestPosts.module.css';

export default function LatestPosts({ posts = [] }) {
  const headingRef = useReveal();
  const gridRef = useReveal();

  if (!posts || posts.length === 0) return null;

  const display = posts.slice(0, 3);

  return (
    <section className={styles.section}>
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div ref={headingRef} className={`${styles.header} reveal`}>
          <div className={styles.titleBlock}>
            <div className={styles.kickerRow}>
              <span className="signal-dot signal-dot--sm" aria-hidden="true" />
              <span className={styles.kicker}>Reading list</span>
            </div>
            <h2 className={styles.heading}>From the blog</h2>
          </div>
          <Link to="/blog" className={styles.viewAll}>
            View all
            <ArrowRightIcon size={14} />
          </Link>
        </div>

        <div ref={gridRef} className={`${styles.grid} reveal`}>
          {display.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className={styles.card}
            >
              <div className={styles.cardBanner}>
                <BlogBanner slug={post.slug} category={post.category} height={120} />
              </div>
              <div className={styles.cardBody}>
                {post.category && (
                  <span className={styles.cardCategory}>{post.category}</span>
                )}
                <h3 className={styles.cardTitle}>{post.title}</h3>
                <span className={styles.cardMeta}>
                  {formatDateShort(post.date)}
                  <span className={styles.cardDot} aria-hidden="true" />
                  {post.readingTime} min read
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
