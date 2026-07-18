/*
 * BLOG BANNER — Category-Driven Patterns
 *
 * Each category gets a fundamentally different visual structure:
 *   Email Deliverability → signal waves (email in transit)
 *   SMTP Guides          → network nodes + connections (servers talking)
 *   Product Comparisons  → split grid / versus divider
 *   Product Updates      → radial burst (energy, momentum)
 *   Email Marketing      → flowing data streams
 *   Case Studies         → growth chart lines
 *
 * All patterns use gold accent family on Studio Black.
 * The slug hash varies positions, sizes, densities within each pattern.
 * You recognize the category before reading the tag.
 */

const CATEGORY_CONFIG = {
  'Email Deliverability': { accent: '#D4A843', accentAlt: '#B8902E', pattern: 'waves' },
  'SMTP Guides':          { accent: '#B8902E', accentAlt: '#A08432', pattern: 'network' },
  'Product Comparisons':  { accent: '#D4A843', accentAlt: '#B8902E', pattern: 'versus' },
  'Product Updates':      { accent: '#D4A843', accentAlt: '#A08432', pattern: 'burst' },
  'Email Marketing':      { accent: '#D4A843', accentAlt: '#B8902E', pattern: 'streams' },
  'Case Studies':         { accent: '#D4A843', accentAlt: '#B8902E', pattern: 'growth' },
};

const DEFAULT_CONFIG = { accent: '#D4A843', accentAlt: '#B8902E', pattern: 'waves' }; 

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Round to 2 decimals - keeps SVG path strings identical on server and client
const r = (n) => Math.round(n * 100) / 100;

/* ——— PATTERN: Signal Waves (Email Deliverability) ——— */
function renderWaves(rand, w, h, accent, accentAlt) {
  const waveCount = 3 + Math.floor(rand() * 2);
  const waves = [];

  for (let i = 0; i < waveCount; i++) {
    const baseY = (h * 0.2) + (i * h * 0.18) + (rand() * h * 0.08);
    const amp = 10 + rand() * 18;
    const freq = 0.008 + rand() * 0.006;
    const phase = rand() * Math.PI * 2;
    const isMain = i === 1;
    const opacity = isMain ? 0.3 : 0.08 + rand() * 0.06;
    const strokeW = isMain ? 1.8 : 0.7 + rand() * 0.5;

    let d = `M 0 ${r(baseY)}`;
    for (let x = 0; x <= w; x += 3) {
      const y = baseY + Math.sin(x * freq + phase) * amp;
      d += ` L ${x} ${r(y)}`;
    }

    waves.push(
      <path
        key={`w-${i}`}
        d={d}
        stroke={isMain ? accent : accentAlt}
        strokeWidth={strokeW}
        fill="none"
        opacity={opacity}
      />
    );
  }

  // Signal pulse dots along the main wave
  const mainBaseY = (h * 0.2) + (1 * h * 0.18) + (rand() * h * 0.08);
  const mainAmp = 14;
  const mainFreq = 0.01;
  const mainPhase = rand() * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    const x = w * 0.1 + (i * w * 0.15) + rand() * 30;
    const y = mainBaseY + Math.sin(x * mainFreq + mainPhase) * mainAmp;
    waves.push(
      <circle
        key={`d-${i}`}
        cx={x} cy={y}
        r={2 + rand() * 2}
        fill={accent}
        opacity={0.15 + rand() * 0.15}
      />
    );
  }

  return waves;
}

/* ——— PATTERN: Network Nodes (SMTP Guides) ——— */
function renderNetwork(rand, w, h, accent, accentAlt) {
  const nodeCount = 7 + Math.floor(rand() * 4);
  const elements = [];
  const nodes = [];

  for (let i = 0; i < nodeCount; i++) {
    const x = w * 0.08 + rand() * w * 0.84;
    const y = h * 0.12 + rand() * h * 0.76;
    const r = 2 + rand() * 3.5;
    const isPrimary = i < 3;
    nodes.push({ x, y, r, isPrimary });
  }

  // Connections first (behind nodes)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      // r() rounds sqrt to stable precision - prevents last-ULP drift between Node V8 and browser V8 versions.
      const dist = r(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
      if (dist < w * 0.3) {
        const strong = a.isPrimary && b.isPrimary;
        elements.push(
          <line
            key={`c-${i}-${j}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={strong ? accent : accentAlt}
            strokeWidth={strong ? 1.2 : 0.5}
            opacity={strong ? 0.2 : 0.06}
            strokeDasharray={strong ? 'none' : '3 5'}
          />
        );
      }
    }
  }

  // Nodes on top
  nodes.forEach((n, i) => {
    elements.push(
      <circle
        key={`n-${i}`}
        cx={n.x} cy={n.y} r={n.r}
        fill={n.isPrimary ? accent : accentAlt}
        opacity={n.isPrimary ? 0.35 : 0.12}
      />
    );
    if (n.isPrimary) {
      elements.push(
        <circle
          key={`nr-${i}`}
          cx={n.x} cy={n.y} r={n.r + 6}
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          opacity={0.1}
        />
      );
    }
  });

  return elements;
}

/* ——— PATTERN: Versus Split (Product Comparisons) ——— */
function renderVersus(rand, w, h, accent, accentAlt) {
  const elements = [];
  const offset = (rand() - 0.5) * 40;
  const cx = w * 0.5 + offset;

  // Bold angled divider
  elements.push(
    <line
      key="div"
      x1={cx - 25} y1={-5}
      x2={cx + 25} y2={h + 5}
      stroke={accent}
      strokeWidth="2"
      opacity={0.28}
    />
  );

  // Flanking lines
  [-18, 12].forEach((d, i) => {
    elements.push(
      <line
        key={`fl-${i}`}
        x1={cx - 25 + d * (i === 0 ? 1 : -1) - 15} y1={-5}
        x2={cx + 25 + d * (i === 0 ? 1 : -1) - 15} y2={h + 5}
        stroke={accentAlt}
        strokeWidth="0.6"
        opacity={0.07}
      />
    );
  });

  // Left side: horizontal scan lines
  for (let i = 0; i < 7; i++) {
    const y = h * 0.1 + i * (h * 0.12);
    const lineW = 80 + rand() * 160;
    elements.push(
      <line
        key={`sl-${i}`}
        x1={Math.max(0, cx - 70 - lineW)} y1={y}
        x2={cx - 70} y2={y}
        stroke={accent}
        strokeWidth={rand() > 0.6 ? 1.2 : 0.6}
        opacity={0.04 + rand() * 0.06}
      />
    );
  }

  // Right side: dot matrix
  for (let x = cx + 70; x < w - 10; x += 24) {
    for (let y = 16; y < h - 8; y += 20) {
      if (rand() > 0.35) {
        elements.push(
          <circle
            key={`vd-${x}-${y}`}
            cx={x + rand() * 3} cy={y + rand() * 3}
            r={rand() > 0.8 ? 1.5 : 0.8}
            fill={accentAlt}
            opacity={0.08 + rand() * 0.08}
          />
        );
      }
    }
  }

  return elements;
}

/* ——— PATTERN: Radial Burst (Product Updates) ——— */
function renderBurst(rand, w, h, accent, accentAlt) {
  const elements = [];
  const cx = w * (0.3 + rand() * 0.4);
  const cy = h * (0.3 + rand() * 0.4);

  // Concentric rings
  for (let i = 1; i <= 5; i++) {
    const r = 20 * i + rand() * 12;
    elements.push(
      <circle
        key={`ring-${i}`}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={i <= 2 ? accent : accentAlt}
        strokeWidth={i === 1 ? 1.4 : 0.5}
        opacity={0.2 / i}
        strokeDasharray={i > 2 ? '5 7' : 'none'}
      />
    );
  }

  // Radiating lines
  const rayCount = 10 + Math.floor(rand() * 6);
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + rand() * 0.3;
    const innerR = 12 + rand() * 10;
    const outerR = 70 + rand() * 140;
    elements.push(
      <line
        key={`ray-${i}`}
        x1={r(cx + Math.cos(angle) * innerR)}
        y1={r(cy + Math.sin(angle) * innerR)}
        x2={r(cx + Math.cos(angle) * outerR)}
        y2={r(cy + Math.sin(angle) * outerR)}
        stroke={accent}
        strokeWidth="0.7"
        opacity={r(0.05 + rand() * 0.07)}
      />
    );
  }

  // Bright center
  elements.push(
    <circle key="c2" cx={cx} cy={cy} r={5} fill={accent} opacity={0.08} />
  );
  elements.push(
    <circle key="c1" cx={cx} cy={cy} r={2.5} fill={accent} opacity={0.3} />
  );

  return elements;
}

/* ——— PATTERN: Data Streams (Email Marketing) ——— */
function renderStreams(rand, w, h, accent, accentAlt) {
  const elements = [];
  const streamCount = 4 + Math.floor(rand() * 3);

  for (let i = 0; i < streamCount; i++) {
    const startX = -30 + rand() * w * 0.2;
    const endX = w * 0.7 + rand() * w * 0.4;
    const baseY = h * 0.12 + i * (h / (streamCount + 1));
    const curve = 15 + rand() * 30;
    const midX = (startX + endX) / 2;
    const isMain = i === Math.floor(streamCount / 2);

    elements.push(
      <path
        key={`s-${i}`}
        d={`M ${r(startX)} ${r(baseY)} Q ${r(midX)} ${r(baseY - curve)} ${r(endX)} ${r(baseY + curve * 0.3)}`}
        stroke={isMain ? accent : accentAlt}
        strokeWidth={isMain ? 1.6 : 0.7}
        fill="none"
        opacity={isMain ? 0.25 : 0.07}
      />
    );

    // Data packets
    if (rand() > 0.25) {
      const count = 2 + Math.floor(rand() * 4);
      for (let p = 0; p < count; p++) {
        const t = 0.15 + (p / count) * 0.7;
        const px = r(startX + (endX - startX) * t);
        const py = r(baseY + Math.sin(t * Math.PI) * (-curve * 0.4));
        elements.push(
          <rect
            key={`sp-${i}-${p}`}
            x={r(px - 4)} y={r(py - 1.5)}
            width={8} height={3}
            rx={1.5}
            fill={accent}
            opacity={r(0.1 + rand() * 0.12)}
          />
        );
      }
    }
  }

  return elements;
}

/* ——— PATTERN: Growth Chart (Case Studies) ——— */
function renderGrowth(rand, w, h, accent, accentAlt) {
  const elements = [];
  const left = w * 0.1;
  const right = w * 0.9;
  const top = h * 0.15;
  const bottom = h * 0.82;

  // Grid
  for (let i = 1; i <= 4; i++) {
    const y = top + (i / 5) * (bottom - top);
    elements.push(
      <line key={`gy-${i}`} x1={left} y1={y} x2={right} y2={y}
        stroke={accentAlt} strokeWidth="0.4" opacity={0.06} />
    );
  }
  for (let i = 1; i <= 6; i++) {
    const x = left + (i / 7) * (right - left);
    elements.push(
      <line key={`gx-${i}`} x1={x} y1={top} x2={x} y2={bottom}
        stroke={accentAlt} strokeWidth="0.4" opacity={0.06} />
    );
  }

  // Growth curve
  const points = [];
  let currentY = bottom - h * 0.05;
  for (let i = 0; i <= 7; i++) {
    const x = left + (i / 7) * (right - left);
    currentY -= (h * 0.05) + rand() * h * 0.04;
    if (i > 4) currentY -= h * 0.035;
    points.push({ x, y: Math.max(currentY, top + 10) });
  }

  let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const cpx = (points[i - 1].x + points[i].x) / 2;
    d += ` C ${r(cpx)} ${r(points[i - 1].y)} ${r(cpx)} ${r(points[i].y)} ${r(points[i].x)} ${r(points[i].y)}`;
  }

  // Area fill
  const lastPt = points[points.length - 1];
  elements.push(
    <path key="area"
      d={d + ` L ${r(lastPt.x)} ${r(bottom)} L ${r(points[0].x)} ${r(bottom)} Z`}
      fill={accent} opacity={0.04} />
  );

  // Line
  elements.push(
    <path key="line" d={d}
      stroke={accent} strokeWidth="2" fill="none" opacity={0.3} />
  );

  // Data points
  points.forEach((p, i) => {
    if (i > 0 && i < points.length - 1) {
      elements.push(
        <circle key={`gp-${i}`} cx={p.x} cy={p.y} r={2.5}
          fill={accent} opacity={0.25} />
      );
    }
  });

  return elements;
}


/* ——— MAIN COMPONENT ——— */

export default function BlogBanner({ slug = '', category = '', height = 160, variant = 'card' }) {
  const hash = hashCode(slug || 'default');
  const rand = seededRandom(hash);
  const config = CATEGORY_CONFIG[category] || DEFAULT_CONFIG;
  const { accent, accentAlt, pattern } = config;
  const width = 800;
  const id = `bb-${hash % 10000}`;
  const fadeTo = variant === 'full' ? '#09090B' : '#131316';

  const renderers = {
    waves: renderWaves,
    network: renderNetwork,
    versus: renderVersus,
    burst: renderBurst,
    streams: renderStreams,
    growth: renderGrowth,
  };

  const render = renderers[pattern] || renderWaves;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2={width} y2={height} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#09090B" />
          <stop offset="100%" stopColor="#131316" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.05" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fadeTo} stopOpacity="0" />
          <stop offset="100%" stopColor={fadeTo} stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Base */}
      <rect width={width} height={height} fill={`url(#${id}-bg)`} />

      {/* Glow */}
      <ellipse
        cx={width * (0.3 + rand() * 0.4)}
        cy={height * 0.45}
        rx={width * 0.35}
        ry={height * 0.55}
        fill={`url(#${id}-glow)`}
      />

      {/* Pattern */}
      {render(rand, width, height, accent, accentAlt)}

      {/* Bottom fade into card surface */}
      <rect x="0" y={height - 40} width={width} height="40" fill={`url(#${id}-fade)`} />
    </svg>
  );
}