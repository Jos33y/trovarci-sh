import { Link } from 'react-router';
import { ArrowRightIcon } from '~/components/icons';
import { formatDateShort } from '~/utils/format';
import BlogBanner from '~/components/blog/BlogBanner';
import styles from '~/styles/modules/blog/BlogCard.module.css';

export default function BlogCard({ post }) {
  return (
    <article className={styles.card}>
      <Link to={`/blog/${post.slug}`} className={styles.link}>
        <div className={styles.banner}>
          <BlogBanner
            slug={post.slug}
            category={post.category}
            height={140}
          />
        </div>

        <div className={styles.body}>
          {post.category && (
            <span className={styles.category}>{post.category}</span>
          )}

          <h2 className={styles.title}>{post.title}</h2>

          {post.description && (
            <p className={styles.description}>{post.description}</p>
          )}

          <div className={styles.footer}>
            <span className={styles.meta}>
              {post.date && (
                <time dateTime={post.date}>
                  {formatDateShort(post.date)}
                </time>
              )}
              {post.readingTime && (
                <>
                  <span className={styles.dot} aria-hidden="true" />
                  {post.readingTime} min read
                </>
              )}
            </span>

            <span className={styles.readMore}>
              Read
              <ArrowRightIcon size={14} />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
