import { useEffect, useState } from 'react';
import styles from '~/styles/modules/guides/InterestVote.module.css';

// "Rather have it set up for you?" with a thumbs-up and a public count. No email, no
// waitlist: the count tells us whether to open the service. One press per browser.

const COPY = {
  'smtp-desk': {
    title: 'Rather have it set up for you?',
    text: 'We set up the sending account in your name, domain records and all, and you send the same day. Press the thumb if you would use it, and we will open it sooner.',
  },
};

function ThumbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M7 10v10H4.5A1.5 1.5 0 0 1 3 18.5v-7A1.5 1.5 0 0 1 4.5 10H7Zm0 0 4-7c1.4 0 2.5 1.1 2.5 2.5V9h5.1a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.4 20H7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function InterestVote({ id, count }) {
  const copy = COPY[id];
  const key = `trov-interest-${id}`;
  const [voted, setVoted] = useState(false);
  const [n, setN] = useState(count);

  useEffect(() => {
    try { setVoted(window.localStorage.getItem(key) === '1'); } catch { /* storage off: still works */ }
  }, [key]);

  if (!copy) return null;

  const press = () => {
    if (voted) return;
    setVoted(true);
    setN((x) => x + 1);
    try { window.localStorage.setItem(key, '1'); } catch { /* fine */ }
    try { window.__trovTrack?.('interest', { id }); } catch { /* never blocks */ }
  };

  // Counts are saved every few seconds, so a fresh press may not be in the page's number yet.
  const shown = Math.max(n, voted ? 1 : 0);
  const tally = shown === 0 ? 'Be the first.' : `${new Intl.NumberFormat('en-US').format(shown)} ${shown === 1 ? 'person wants' : 'people want'} this.`;

  return (
    <section className={styles.box} aria-labelledby={`interest-${id}`}>
      <p className={styles.kicker}>Coming soon</p>
      <h2 id={`interest-${id}`} className={styles.title}>{copy.title}</h2>
      <p className={styles.text}>{copy.text}</p>
      <div className={styles.row}>
        <button type="button" className={`${styles.thumb} ${voted ? styles.on : ''}`} onClick={press} aria-pressed={voted} disabled={voted}>
          <ThumbIcon />
          {voted ? 'Counted, thank you' : 'I would use this'}
        </button>
        <span className={styles.tally} role="status">{tally}</span>
      </div>
    </section>
  );
}
