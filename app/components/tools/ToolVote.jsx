// "Did this check help?" under a tool result. A no asks what the reader expected, so the tool can be fixed.
// Asked again at most once a week per tool, so regular users are not asked on every run.

import { useEffect, useState } from 'react';
import styles from '~/styles/modules/blog/HelpfulVote.module.css';

const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;
const storeKey = (tool) => `trov_tool_vote_${tool}`;

function votedRecently(tool) {
  try {
    const at = Number(window.localStorage.getItem(storeKey(tool)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < ASK_AGAIN_MS;
  } catch {
    return false;
  }
}

function remember(tool) {
  try { window.localStorage.setItem(storeKey(tool), String(Date.now())); } catch { /* private window */ }
}

function track(metadata) {
  try { window.__trovTrack?.('helpful_vote', metadata); } catch { /* never blocks the tool */ }
}

// tool: the analytics id of the tool (domain_check, email_score, email_verify, phone_verify, smtp_test, dns_generate).
export default function ToolVote({ tool }) {
  const [state, setState] = useState('ask');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (votedRecently(tool)) setState('done');
  }, [tool]);

  const yes = () => {
    track({ v: 'yes', tool });
    remember(tool);
    setState('thanks-yes');
  };

  const sendNo = (event) => {
    event.preventDefault();
    track({ v: 'no', tool, note: note.trim().slice(0, 200) });
    remember(tool);
    setState('thanks-no');
  };

  if (state === 'done') return null;

  const id = `tool-vote-${tool}`;

  return (
    <section className={`${styles.box} ${styles.boxTool}`} aria-labelledby={id} aria-live="polite">
      {state === 'ask' && (
        <>
          <h2 id={id} className={styles.question}>Did this check help?</h2>
          <div className={styles.buttons}>
            <button type="button" className={styles.button} onClick={yes}>Yes</button>
            <button type="button" className={styles.button} onClick={() => setState('why')}>No</button>
          </div>
        </>
      )}

      {state === 'why' && (
        <form onSubmit={sendNo} className={styles.form}>
          <label id={id} htmlFor={`${id}-note`} className={styles.question}>What did you expect to see?</label>
          <textarea
            id={`${id}-note`}
            className={styles.note}
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional. Tell us what was wrong or missing."
          />
          <div className={styles.buttons}>
            <button type="submit" className={styles.button}>Send</button>
          </div>
        </form>
      )}

      {state === 'thanks-yes' && <p id={id} className={styles.thanks}>Thanks. Glad it helped.</p>}
      {state === 'thanks-no' && <p id={id} className={styles.thanks}>Thanks. We read every answer and fix the tool.</p>}
    </section>
  );
}
