import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/Comparison.module.css';

const COMPETITORS = [
  { name: "Trovarcis Reach", highlight: true },
  { name: "Mailchimp" },
  { name: "SendBlaster" },
  { name: "Brevo" },
  { name: "Sendy" },
];

const ROWS = [
  {
    label: "Pricing",
    values: ["One-time $79", "$13-350/mo", "One-time $129", "$9-65/mo", "One-time $69 + SES"],
  },
  {
    label: "Platforms",
    values: ["Win, Mac, Linux, iOS, Android", "Web only", "Windows only", "Web only", "Self-hosted (PHP)"],
  },
  {
    label: "Multi-SMTP failover",
    values: [true, false, false, false, false],
  },
  {
    label: "AI email scoring",
    values: [true, false, false, false, false],
  },
  {
    label: "Works offline",
    values: [true, false, true, false, false],
  },
  {
    label: "Contact limit",
    values: ["Unlimited", "Tiered (price scales)", "Unlimited", "Tiered (price scales)", "Unlimited"],
  },
  {
    label: "Mobile app",
    values: [true, "Limited", false, false, false],
  },
  {
    label: "Your data stays local",
    values: [true, false, true, false, false],
  },
];

function CellValue({ value }) {
  if (value === true) {
    return <span className={styles.yes}>Yes</span>;
  }
  if (value === false) {
    return <span className={styles.no}>No</span>;
  }
  return <span>{value}</span>;
}

export default function Comparison() {
  const headingRef = useReveal();
  const tableRef = useReveal(0.08);

  return (
    <section className={styles.section}>
      <div className={`container ${styles.inner}`}>
        <h2 ref={headingRef} className={`${styles.heading} reveal`}>How we compare</h2>

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
      </div>
    </section>
  );
}
