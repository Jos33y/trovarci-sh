// /guides/:slug - one task, answered first, then the steps. The same guide as Markdown
// lives at /guides/:slug.md for AI tools and agents.

import { data, Form, Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import BlogContent from '~/components/blog/BlogContent';
import GuideNav from '~/components/guides/GuideNav';
import HelpfulVote from '~/components/blog/HelpfulVote';
import InterestVote from '~/components/guides/InterestVote';
import { interestCount } from '~/utils/interest.server';
import { getSeo } from '~/utils/seo';
import { getGuide, getNav, ACTIONS, TOPICS } from '~/utils/guides.server';
import styles from '~/styles/modules/routes/guide.module.css';

export async function loader({ params }) {
  const guide = getGuide(params.slug);
  if (!guide) throw data(null, { status: 404, statusText: 'Guide not found' });
  const topic = TOPICS.find((t) => t.id === guide.topic);
  const interest = guide.interest ? { id: guide.interest, count: await interestCount(guide.interest) } : null;
  return { guide, topic, nav: getNav(), action: ACTIONS[guide.action], interest };
}

const longDate = (iso) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export const meta = ({ data: d }) => {
  if (!d) return [{ title: 'Guide not found | Trovarcis' }];
  const { guide, topic } = d;
  const url = `https://trovarci.sh/guides/${guide.slug}`;
  const tags = getSeo({ title: guide.title, description: guide.description, path: `/guides/${guide.slug}`, type: 'article' });
  tags.push({ tagName: 'link', rel: 'alternate', type: 'text/markdown', href: `${url}.md` });
  tags.push({
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: guide.title,
          description: guide.short,
          url,
          datePublished: guide.published,
          dateModified: guide.checked,
          author: { '@type': 'Organization', name: 'Trovarcis', url: 'https://trovarci.sh' },
          publisher: { '@type': 'Organization', name: 'Trovarcis', url: 'https://trovarci.sh' },
          isPartOf: { '@type': 'CollectionPage', name: 'Trovarcis help desk', url: 'https://trovarci.sh/guides' },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Help desk', item: 'https://trovarci.sh/guides' },
            { '@type': 'ListItem', position: 2, name: topic.label, item: `https://trovarci.sh/guides#t-${topic.id}` },
            { '@type': 'ListItem', position: 3, name: guide.title, item: url },
          ],
        },
      ],
    },
  });
  return tags;
};

export default function Guide() {
  const { guide, topic, nav, action, interest } = useLoaderData();

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={`container ${styles.layout}`}>
          <aside className={styles.side}>
            <Form method="get" action="/guides" role="search" className={styles.sideAsk}>
              <label htmlFor="side-ask" className={styles.visuallyHidden}>Ask another question</label>
              <input id="side-ask" name="q" type="search" placeholder="Ask another question…" className={styles.sideInput} autoComplete="off" spellCheck={false} />
            </Form>
            <GuideNav topics={nav} current={guide.slug} />
          </aside>

          <article className={styles.article}>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link to="/guides">Help desk</Link>
              <span aria-hidden="true">/</span>
              <Link to={`/guides#t-${topic.id}`}>{topic.label}</Link>
            </nav>

            <h1 className={styles.title}>{guide.title}</h1>
            <p className={styles.meta}>
              Checked <time dateTime={guide.checked}>{longDate(guide.checked)}</time> &middot; {guide.minutes} min
            </p>

            <section className={styles.short} aria-labelledby="in-short">
              <h2 id="in-short" className={styles.shortLabel}>In short</h2>
              <p className={styles.shortText}>{guide.short}</p>
            </section>

            {guide.needs.length > 0 && (
              <div className={styles.needs}>
                <span className={styles.needsLabel}>You need</span>
                <ul className={styles.needsList}>
                  {guide.needs.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            )}

            <div className={styles.body}>
              <BlogContent html={guide.html} />
            </div>

            {guide.slow && (
              <section className={styles.slow} aria-labelledby="slow-part">
                <div className={styles.slowText}>
                  <h2 id="slow-part" className={styles.slowLabel}>The slow part, done for you</h2>
                  <p className={styles.slowBody}>{guide.slow}</p>
                </div>
                <div className={styles.slowAction}>
                  <Link to={action.href} className={styles.button}>{action.label}</Link>
                  <span className={styles.buttonNote}>{action.note}</span>
                </div>
              </section>
            )}

            {interest && <InterestVote id={interest.id} count={interest.count} />}

            {guide.post && (
              <Link to={`/blog/${guide.post.slug}`} className={styles.full}>
                <span className={styles.fullLabel}>The full explanation</span>
                <span className={styles.fullTitle}>{guide.post.title}</span>
              </Link>
            )}

            {guide.sources.length > 0 && (
              <section className={styles.sources} aria-labelledby="sources">
                <h2 id="sources" className={styles.sourcesLabel}>Checked against</h2>
                <ol className={styles.sourceList}>
                  {guide.sources.map((s) => (
                    <li key={s.url}><a href={s.url} rel="noopener" target="_blank">{s.label}</a></li>
                  ))}
                </ol>
              </section>
            )}

            <HelpfulVote slug={`guide-${guide.slug}`} />

            {guide.related.length > 0 && (
              <section className={styles.related} aria-labelledby="related">
                <h2 id="related" className={styles.relatedLabel}>Next questions</h2>
                <ul className={styles.relatedList}>
                  {guide.related.map((r) => (
                    <li key={r.slug}>
                      <Link to={`/guides/${r.slug}`} className={styles.relatedLink}>
                        <span className={styles.relatedTitle}>{r.title}</span>
                        <span className={styles.relatedShort}>{r.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>

          {guide.steps.length > 1 && (
            <aside className={styles.toc} aria-label="On this page">
              <p className={styles.tocLabel}>On this page</p>
              <ol className={styles.tocList}>
                {guide.steps.map((st) => (
                  <li key={st.id}><a href={`#${st.id}`} className={styles.tocLink}>{st.text}</a></li>
                ))}
              </ol>
            </aside>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
