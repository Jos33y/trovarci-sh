import { useEffect, useRef } from 'react';
import styles from '~/styles/modules/landing/Hero.module.css';

// The sending route behind the hero copy: one computer on the left, three SMTP accounts,
// and many inboxes on the right, with messages travelling between them. Drawn in SVG and
// animated with SMIL, so it runs without JavaScript; JS only pauses it while off screen.

const ORIGIN = [110, 400];
const ACCOUNTS = [[330, 190], [300, 420], [350, 640]];
const INBOXES = [[1180, 130], [1330, 200], [1250, 330], [1370, 420], [1210, 520], [1330, 610], [1190, 700]];

const ROUTES = [
  'M110,400 C190,400 230,190 330,190 C520,190 560,50 720,50 C900,50 960,130 1180,130',
  'M110,400 C190,400 230,190 330,190 C470,190 520,90 720,90 C930,90 1080,200 1330,200',
  'M110,400 C190,400 220,420 300,420 C520,420 560,300 720,300 C900,300 1000,330 1250,330',
  'M110,400 C200,400 220,420 300,420 C520,420 600,470 760,470 C960,470 1120,420 1370,420',
  'M110,400 C190,400 250,640 350,640 C560,640 560,760 720,760 C900,760 1000,520 1210,520',
  'M110,400 C190,400 250,640 350,640 C520,640 580,720 760,720 C960,720 1100,610 1330,610',
  'M110,400 C190,400 250,640 350,640 C540,640 600,790 800,790 C980,790 1060,700 1190,700',
];

// Which route each message takes, how long the trip lasts and when it first leaves.
const PACKETS = [
  { route: 0, dur: 6.4, begin: 0 },
  { route: 3, dur: 5.6, begin: 0.9 },
  { route: 5, dur: 6.8, begin: 1.7 },
  { route: 2, dur: 5.2, begin: 2.6 },
  { route: 1, dur: 7.0, begin: 3.4 },
  { route: 6, dur: 6.2, begin: 4.3 },
  { route: 4, dur: 5.8, begin: 5.1 },
  { route: 3, dur: 5.6, begin: 6.0 },
];

// Inboxes that light up as mail lands, timed to the packets arriving there.
const ARRIVALS = [
  { inbox: 0, dur: 6.4, begin: 0 },
  { inbox: 3, dur: 5.6, begin: 0.9 },
  { inbox: 5, dur: 6.8, begin: 1.7 },
  { inbox: 2, dur: 5.2, begin: 2.6 },
];

export default function HeroNetwork() {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof IntersectionObserver === 'undefined' || !svg.pauseAnimations) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) svg.unpauseAnimations();
      else svg.pauseAnimations();
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      className={styles.network}
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="hn-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="0.12" stopColor="#fff" />
          <stop offset="0.78" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hn-quiet">
          <stop offset="0" stopColor="#000" stopOpacity="0.86" />
          <stop offset="0.65" stopColor="#000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {/* Full strength at the edges, quieter behind the headline, gone toward the product shot. */}
        <mask id="hn-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="800">
          <rect width="1440" height="800" fill="url(#hn-fade)" />
          <ellipse cx="720" cy="370" rx="420" ry="320" fill="url(#hn-quiet)" />
        </mask>
        {ROUTES.map((d, i) => <path key={d} id={`hn-route-${i}`} d={d} />)}
      </defs>

      <g mask="url(#hn-mask)">
        <g className={styles.netRoutes} fill="none">
          {ROUTES.map((d, i) => <use key={d} href={`#hn-route-${i}`} />)}
        </g>

        <g className={styles.netNodes}>
          {ACCOUNTS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}
          {INBOXES.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" />)}
        </g>

        <g className={styles.netOrigin}>
          <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r="16" />
          <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r="6" />
        </g>

        <g className={styles.netArrivals}>
          {ARRIVALS.map(({ inbox, dur, begin }) => {
            const [x, y] = INBOXES[inbox];
            const at = `${(begin + dur * 0.97).toFixed(2)}s`;
            return (
              <circle key={inbox} cx={x} cy={y} r="4" opacity="0">
                <animate attributeName="r" values="4;20;20" keyTimes="0;0.22;1" dur={`${dur}s`} begin={at} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0;0" keyTimes="0;0.22;1" dur={`${dur}s`} begin={at} repeatCount="indefinite" />
              </circle>
            );
          })}
        </g>

        <g className={styles.netPackets}>
          {PACKETS.map(({ route, dur, begin }, i) => (
            <g key={i} opacity="0">
              <circle r="9" className={styles.netHalo} />
              <circle r="2.6" />
              <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite"
                calcMode="spline" keyTimes="0;1" keyPoints="0;1" keySplines="0.45 0 0.4 1">
                <mpath href={`#hn-route-${route}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.92;1"
                dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
