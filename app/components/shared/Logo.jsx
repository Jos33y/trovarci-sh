export function TrovarcisIcon({ size = 48, variant = "default", className }) {
  const fills = {
    default: { bg: "#09090B", stroke: "#D4A843", bolt: "#D4A843" },
    inverted: { bg: "#D4A843", stroke: "#09090B", bolt: "#09090B" },
    light: { bg: "#FAFAFA", stroke: "#9E7B28", bolt: "#9E7B28" },
  };
  const c = fills[variant] || fills.default;

  return ( 
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Trovarcis icon"
      className={className}
    >
      {/* Container */}
      <rect
        x="1.5" y="1.5" width="45" height="45" rx="11"
        fill={c.bg}
        stroke={c.stroke}
        strokeWidth="1.5"
      />
      {/* Shield */}
      <path
        d="M24 7L11 13.5V24C11 28.5 13 32.5 16 35.5C18.5 38 21.2 39.8 24 41C26.8 39.8 29.5 38 32 35.5C35 32.5 37 28.5 37 24V13.5L24 7Z"
        fill="none"
        stroke={c.stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Bolt */}
      <path
        d="M27 13L17.5 25H22.5L20 36L32 23H26L27 13Z"
        fill={c.bolt}
        strokeLinejoin="bevel"
      />
    </svg>
  );
}

export function TrovarcisLogo({ size = 48, showText = true, className }) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: size * 0.22 }}
    >
      <TrovarcisIcon size={size} />
      {showText && (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: size * 0.5,
            color: "var(--trov-text)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          Trovar<span style={{ color: "var(--trov-accent)" }}>cis</span>
        </span>
      )}
    </div>
  );
}

export function TrovarcisReachLogo({ size = 48, className }) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: size * 0.22 }}
    >
      <TrovarcisIcon size={size} />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: size * 0.5,
          color: "var(--trov-text)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        Trovarcis <span style={{ color: "var(--trov-accent)" }}>Reach</span>
      </span>
    </div>
  );
}

export function TrovarcisAdminLogo({ size = 48, className }) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: size * 0.22 }}
    >
      <TrovarcisIcon size={size} />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: size * 0.5,
          color: "var(--trov-text)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        Trovarcis <span style={{ color: "var(--trov-accent)" }}>Admin</span>
      </span>
    </div>
  );
}
