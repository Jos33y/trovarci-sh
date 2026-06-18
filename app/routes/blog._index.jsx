import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { getAllPosts } from '~/utils/markdown.server';
import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import BlogCard from '~/components/blog/BlogCard';
import styles from '~/styles/modules/routes/blog.module.css';

export const meta = () => getSeo({
  title: 'Blog',
  description: 'Guides, tutorials, and insights on email deliverability, SMTP configuration, and bulk email best practices.',
  path: '/blog',
});

export function loader() {
  const posts = getAllPosts();

  // Extract unique categories
  const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))];

  return { posts, categories };
}

export default function BlogIndex() {
  const { posts, categories } = useLoaderData();
  const [activeCategory, setActiveCategory] = useState('All');
  const headerRef = useReveal();
  const filtersRef = useReveal();
  const gridRef = useReveal();

  const filtered = activeCategory === 'All'
    ? posts
    : posts.filter((p) => p.category === activeCategory);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container">
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <h1 className={styles.heading}>Blog</h1>
            <p className={styles.subtitle}>
              Guides and insights on email deliverability, SMTP configuration,
              and sending email at scale.
            </p>
          </header>

          {categories.length > 1 && (
            <div ref={filtersRef} className={`${styles.filters} reveal`}>
              <button
                className={`${styles.filterPill} ${activeCategory === 'All' ? styles.filterActive : ''}`}
                onClick={() => setActiveCategory('All')}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.filterPill} ${activeCategory === cat ? styles.filterActive : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {filtered.length > 0 ? (
            <div ref={gridRef} className={`${styles.grid} reveal`}>
              {filtered.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No posts in this category yet.</p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}