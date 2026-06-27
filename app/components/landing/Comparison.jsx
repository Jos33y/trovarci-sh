import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/Comparison.module.css';

const COMPETITORS = [
  { name: "Trovarcis Reach", highlight: true },
  { name: "NeverBounce" },
  { name: "ZeroBounce" },
  { name: "MailTester" },
];

const ROWS = [
  {
    label: "Email verification",
    values: ["From $0.002 / email*", "$0.008 / email", "$0.0195 / email", false],
  },
  {
    label: "AI email scoring",
    values: [true, false, "Basic", "Basic"],
  },
  {
    label: "Phone validation",
    values: [true, false, false, false],
  },
  {
    label: "Domain + blacklist audit",
    values: ["Free", false, false, "Limited"],
  },
  {
    label: "SMTP tester",
    values: ["Free", false, false, false],
  },
  {
    label: "DNS record generator",
    values: ["Free", false, false, false],
  },
  {
    label: "Pay as you go",
    values: [true, true, true, "n/a"],
  },
  {
    label: "No subscription required",
    values: [true, false, false, true],
  },
  {
    label: "Credit expiry",
    values: ["12 months", "12 months", "Never", "n/a"],
  },
];

const FREE_LABEL = "Free";

function CellValue({ value }) {
  if (value === true) {
    return <span className={styles.yes}>Yes</span>;
  }
  if (value === false) {
    return <span className={styles.no}>No</span>;
  }
  if (value === FREE_LABEL) {
    return <span className={styles.free}>Free</span>;
  }
  return <span className={styles.text}>{value}</span>;
}

export default function Comparison() {
  const headingRef = useReveal();
  const subRef = useReveal();
  const tableRef = useReveal(0.08);

  return (
    <section className={styles.section}>
      <div className={styles.bgBeam} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div ref={headingRef} className={`${styles.header} reveal`}>
          <div className={styles.kickerRow}>
            <span className="signal-dot signal-dot--sm" aria-hidden="true" />
            <span className={styles.kicker}>vs the field</span>
          </div>
          <h2 className={styles.heading}>How we compare</h2>
        </div>

        <p ref={subRef} className={`${styles.sub} reveal`}>
          Most deliverability tools do one thing. Trovarcis Reach is the toolkit.
        </p>

        <div ref={tableRef} className={`${styles.tableWrap} reveal`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.labelHead} />
                {COMPETITORS.map((c) => (
                  <th
                    key={c.name}
                    className={`${styles.colHead} ${c.highlight ? styles.colHighlight : ''}`}
                  >
                    {c.highlight && (
                      <span className={styles.headDot}>
                        <span className="signal-dot signal-dot--sm" aria-hidden="true" />
                      </span>
                    )}
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <td className={styles.rowLabel}>{row.label}</td>
                  {row.values.map((val, i) => (
                    <td
                      key={i}
                      className={`${styles.cell} ${COMPETITORS[i].highlight ? styles.cellHighlight : ''}`}
                    >
                      <CellValue value={val} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.note}>
          *Bulk rate: 1 credit per 5 emails at $0.01 per credit. Single-mode verification is $0.01 per email.
        </p>
      </div>
    </section>
  );
}
