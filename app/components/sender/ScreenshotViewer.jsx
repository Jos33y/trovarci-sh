// Real Trovarcis Sender screens on /sender: one large view and a row of tabs to switch between them.

import { useState } from 'react';
import styles from '~/styles/modules/shared/ScreenshotViewer.module.css';

const SHOTS = [
  { id: 'overview', h: 1179, tab: 'Overview', caption: 'Getting started, your license and how much your accounts can send in a day.' },
  { id: 'smtp', h: 1179, tab: 'Accounts', caption: 'Your SMTP accounts, each tested before a campaign uses it.' },
  { id: 'import', h: 1179, tab: 'Lists', caption: 'Duplicates and broken addresses caught the moment you import a list.' },
  { id: 'compose', h: 1018, tab: 'Compose', caption: 'Merge fields filled in for each recipient, so you read the real message before it sends.' },
  { id: 'report', h: 1179, tab: 'Send', caption: 'Each account sends at its own pace within its limits. Pause or cancel at any time.' },
];

const src = (id, w) => `/images/sender/sender-${id}-${w}.webp`;

export default function ScreenshotViewer() {
  const [active, setActive] = useState(0);
  const shot = SHOTS[active];

  const onKeyDown = (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + SHOTS.length) % SHOTS.length;
    setActive(next);
    event.currentTarget.parentElement?.children[next]?.focus();
  };

  return (
    <section className={styles.viewer} aria-labelledby="shots-title">
      <h2 id="shots-title" className={styles.title}>See it</h2>

      <div className={styles.tabs} role="tablist" aria-label="Sender screens">
        {SHOTS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`shot-tab-${s.id}`}
            aria-selected={i === active}
            aria-controls="shot-panel"
            tabIndex={i === active ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
          >
            {s.tab}
          </button>
        ))}
      </div>

      <figure id="shot-panel" role="tabpanel" aria-labelledby={`shot-tab-${shot.id}`} className={styles.frame}>
        <img
          key={shot.id}
          src={src(shot.id, 1600)}
          srcSet={`${src(shot.id, 800)} 800w, ${src(shot.id, 1600)} 1600w`}
          sizes="(min-width: 1240px) 1152px, calc(100vw - 32px)"
          width="1600"
          height={shot.h}
          alt={`Trovarcis Sender, ${shot.tab} screen. ${shot.caption}`}
          className={styles.image}
          loading={active === 0 ? 'eager' : 'lazy'}
          decoding="async"
        />
        <figcaption className={styles.caption}>{shot.caption}</figcaption>
      </figure>

    </section>
  );
}
