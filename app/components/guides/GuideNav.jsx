import { Link } from 'react-router';
import styles from '~/styles/modules/guides/GuideNav.module.css';

// Every guide, by topic. The help desk's left column on desktop; a "Browse all guides"
// drawer on phones. Grows with the guides without any change here.
export default function GuideNav({ topics, current }) {
  const list = (
    <nav className={styles.nav} aria-label="All guides">
      {topics.map((t) => (
        <section key={t.id} className={styles.group}>
          <h2 className={styles.topic}>
            <Link to={`/guides#t-${t.id}`} className={styles.topicLink}>{t.label}</Link>
          </h2>
          <ul className={styles.list}>
            {t.guides.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/guides/${g.slug}`}
                  className={`${styles.link} ${g.slug === current ? styles.on : ''}`}
                  aria-current={g.slug === current ? 'page' : undefined}
                >
                  {g.nav || g.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );

  return (
    <>
      <div className={styles.rail}>{list}</div>
      <details className={styles.drawer}>
        <summary className={styles.drawerSummary}>Browse all guides</summary>
        {list}
      </details>
    </>
  );
}
