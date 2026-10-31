// /about/:slug - author profile: who writes the posts and builds the tools, with their posts listed.

import { useLoaderData, Link, data } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getAllPosts } from '~/utils/markdown.server';
import { AUTHORS, authorUrl, authorSchema } from '~/utils/authors';
import { getSeo } from '~/utils/seo';
import { formatDateShort } from '~/utils/format';
import styles from '~/styles/modules/routes/author.module.css';

export function meta({ data: payload }) {
  const author = payload?.author;
  if (!author) return getSeo({ title: 'Author not found', path: '/about' });
  return getSeo({
    title: `${author.name}, ${author.role}`,
    description: author.short,
    path: authorUrl(author),
    type: 'profile',
    image: `https://trovarci.sh${author.image}`,
    imageAlt: author.name,
  });
}

export function loader({ params }) {
  const author = AUTHORS[params.slug];
  if (!author) throw data(null, { status: 404, statusText: 'Author not found' });
  const posts = getAllPosts()
    .filter((p) => p.author === author.slug)
    .map(({ slug, title, date }) => ({ slug, title, date }));
  return { author, posts };
}

export default function AuthorPage() {
  const { author, posts } = useLoaderData();

  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: authorSchema(author),
  };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />

        <div className={`container ${styles.inner}`}>
          <header className={styles.profile}>
            <img
              src={author.image}
              alt={author.name}
              width="160"
              height="160"
              className={styles.photo}
            />
            <div className={styles.profileText}>
              <h1 className={styles.name}>{author.name}</h1>
              <p className={styles.role}>{author.role}</p>
              <ul className={styles.links}>
                {author.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className={styles.link} rel="me noopener" target="_blank">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </header>

          <section className={styles.bio} aria-label="About">
            {author.bio.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </section>

          {posts.length > 0 && (
            <section className={styles.writing}>
              <h2 className={styles.sectionTitle}>Writing</h2>
              <ul className={styles.postList}>
                {posts.map((p) => (
                  <li key={p.slug}>
                    <Link to={`/blog/${p.slug}`} className={styles.postItem}>
                      <span className={styles.postTitle}>{p.title}</span>
                      {p.date && (
                        <time className={styles.postDate} dateTime={p.date}>
                          {formatDateShort(p.date)}
                        </time>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
