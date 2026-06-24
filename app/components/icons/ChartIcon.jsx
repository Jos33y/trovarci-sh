export default function ChartIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <line
        x1="4"
        y1="20"
        x2="20"
        y2="20"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="6" y="13" width="2.6" height="6" rx="0.6" stroke={color} strokeWidth="1.8" />
      <rect x="10.7" y="8" width="2.6" height="11" rx="0.6" stroke={color} strokeWidth="1.8" />
      <rect x="15.4" y="15" width="2.6" height="4" rx="0.6" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}
