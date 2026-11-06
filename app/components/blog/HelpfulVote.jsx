// "Did this answer your question?" under a post. A no asks what was missing, so the page can be fixed.

import { useEffect, useState } from 'react';
import styles from '~/styles/modules/blog/HelpfulVote.module.css';

const storeKey = (slug) => `trov_vote_${slug}`;

function remembered(slug) {
  try { return window.localStorage.getItem(storeKey(slug)); } catch { return null; }
}

function remember(slug, value) {
  try { window.localStorage.setItem(storeKey(slug), value); } catch { /* private window */ }
}

function track(metadata) {
  try { window.__trovTrack?.('helpful_vote', metadata); } catch { /* never blocks the page */ }
}

export default function HelpfulVote({ slug }) {
  const [state, setState] = useState('ask');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (remembered(slug)) setState('done');
  }, [slug]);

  const yes = () => {
    track({ v: 'yes', slug });
    remember(slug, 'yes');
    setState('thanks-yes');
  };

  const no = () => setState('why');

  const sendNo = (event) => {
    event.preventDefault();
    track({ v: 'no', slug, note: note.trim().slice(0, 200) });
    remember(slug, 'no');
    setState('thanks-no');
  };

  if (state === 'done') return null;

  return (
    <section className={styles.box} aria-labelledby={`vote-${slug}`} aria-live="polite">
      {state === 'ask' && (
        <>
          <h2 id={`vote-${slug}`} className={styles.question}>Did this answer your question?</h2>
          <div className={styles.buttons}>
            <button type="button" className={styles.button} onClick={yes}>Yes</button>
            <button type="button" className={styles.button} onClick={no}>No</button>
          </div>
        </>
      )}

      {state === 'why' && (
        <form onSubmit={sendNo} className={styles.form}>
          <label id={`vote-${slug}`} htmlFor={`vote-note-${slug}`} className={styles.question}>
            What were you looking for?
          </label>
          <textarea
            id={`vote-note-${slug}`}
            className={styles.note}
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional. Tell us what was missing."
          />
          <div className={styles.buttons}>
            <button type="submit" className={styles.button}>Send</button>
          </div>
        </form>
      )}

      {state === 'thanks-yes' && <p id={`vote-${slug}`} className={styles.thanks}>Thanks. Glad it helped.</p>}
      {state === 'thanks-no' && <p id={`vote-${slug}`} className={styles.thanks}>Thanks. We read every answer and fix the page.</p>}
    </section>
  );
}
