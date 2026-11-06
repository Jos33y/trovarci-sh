import styles from '~/styles/modules/tools/ToolExample.module.css';

// An example result for a tool page, so a visitor knows what they will get back before they
// run a check or sign up, plus what each kind of result means and what to do about it.
// Everything here is static and clearly marked as an example.

const MARK = { pass: '✓', fail: '✗', warn: '!', info: 'i' };

function Mark({ tone }) {
  return <span className={`${styles.mark} ${styles[`mark_${tone}`]}`} aria-hidden="true">{MARK[tone]}</span>;
}

const TONE_WORD = { pass: 'Passed', fail: 'Problem', warn: 'Warning', info: 'Note' };

export default function ToolExample({ input, summary, stats, rows, rowsLabel, cost, meanings, meaningsTitle = 'What each result means' }) {
  return (
    <div className={styles.wrap}>
      <figure className={styles.card}>
        <div className={styles.bar}>
          <span className={styles.tag}>Example result</span>
          <span className={styles.input} title={input}>{input}</span>
        </div>

        {summary && (
          <div className={`${styles.summary} ${styles[`summary_${summary.tone}`]}`}>
            <Mark tone={summary.tone} />
            <div className={styles.summaryText}>
              <p className={styles.summaryTitle}>{summary.title}</p>
              {summary.text && <p className={styles.summaryNote}>{summary.text}</p>}
            </div>
          </div>
        )}

        {stats && (
          <dl className={styles.stats}>
            {stats.map((s) => (
              <div key={s.label} className={styles.stat}>
                <dt className={styles.statLabel}>
                  <span className={`${styles.dot} ${styles[`dot_${s.tone}`]}`} aria-hidden="true" />
                  {s.label}
                </dt>
                <dd className={styles.statValue}>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {rows && (
          <>
            {rowsLabel && <p className={styles.rowsLabel}>{rowsLabel}</p>}
            <ul className={styles.rows}>
              {rows.map((r) => (
                <li key={r.label} className={styles.row}>
                  <Mark tone={r.tone} />
                  <span className={styles.visuallyHidden}>{TONE_WORD[r.tone]}: </span>
                  <div className={styles.rowBody}>
                    <p className={styles.rowHead}>
                      <span className={styles.rowLabel}>{r.label}</span>
                      {r.value && <span className={styles.rowValue}>{r.value}</span>}
                    </p>
                    {r.note && <p className={styles.rowNote}>{r.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {cost && <figcaption className={styles.cost}>{cost}</figcaption>}
      </figure>

      {meanings && (
        <div className={styles.meanings}>
          <h3 className={styles.meaningsTitle}>{meaningsTitle}</h3>
          <dl className={styles.meaningList}>
            {meanings.map((m) => (
              <div key={m.result} className={styles.meaning}>
                <dt className={styles.meaningResult}>
                  <span className={`${styles.dot} ${styles[`dot_${m.tone}`]}`} aria-hidden="true" />
                  {m.result}
                </dt>
                <dd className={styles.meaningText}>
                  {m.means}
                  {m.todo && <span className={styles.meaningTodo}>{m.todo}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
