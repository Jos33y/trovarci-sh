export default function CardIcon({ size = 24, color = 'currentColor', className }) {
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
      <rect
        x="3"
        y="6"
        width="18"
        height="13"
        rx="2"
        stroke={color}
        strokeWidth="1.8"
      />
      <line x1="3" y1="10.5" x2="21" y2="10.5" stroke={color} strokeWidth="1.8" />
      <line
        x1="7"
        y1="15"
        x2="11"
        y2="15"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
