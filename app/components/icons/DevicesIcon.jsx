export default function DevicesIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Desktop monitor */}
      <rect
        x="2"
        y="3"
        width="14"
        height="11"
        rx="2"
        stroke={color}
        strokeWidth="1.8"
      />
      <path
        d="M6 18H12"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 14V18"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Mobile phone */}
      <rect
        x="17"
        y="8"
        width="5"
        height="13"
        rx="1.5"
        stroke={color}
        strokeWidth="1.8"
      />
      <path
        d="M19 18.5H20"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
