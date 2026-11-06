import { useId } from 'react';
import styles from '~/styles/modules/calculator/PaidStamp.module.css';

// An ink postmark struck over the Sender rows: "Paid once", with cancellation waves.
// Linework only, two golds, nothing lit.

const WAVES = [38, 50, 62, 74, 86].map((y) => {
  let d = '';
  for (let x = 0; x <= 78; x += 3) {
    d += `${x ? 'L' : 'M'}${x} ${(y + 3.2 * Math.sin(x * 0.16)).toFixed(1)}`;
  }
  return d;
});

export default function PaidStamp({ price }) {
  const id = `ring${useId().replace(/:/g, '')}`;
  return (
    <svg className={styles.stamp} viewBox="0 0 200 124" aria-hidden="true" focusable="false">
      <defs>
        <path id={id} d="M138 62 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0" />
      </defs>
      <g className={styles.waves}>
        {WAVES.map((d) => <path key={d} d={d} />)}
      </g>
      <circle className={styles.rim} cx="138" cy="62" r="56" />
      <circle className={styles.rimThin} cx="138" cy="62" r="52" />
      <circle className={styles.dots} cx="138" cy="62" r="30" />
      <text className={styles.ringText}>
        <textPath href={`#${id}`} textLength="256" lengthAdjust="spacing">
          PAID ONCE · TROVARCIS SENDER · PAID ONCE ·
        </textPath>
      </text>
      <text className={styles.price} x="138" y="66" textAnchor="middle">{price}</text>
      <text className={styles.small} x="138" y="80" textAnchor="middle">NO MONTHLY BILL</text>
    </svg>
  );
}
