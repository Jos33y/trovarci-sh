export default function AlertIcon({ size = 24, color = 'currentColor', className }) {
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
      <path
        d="M12 4 L21 19 H3 Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="10"
        x2="12"
        y2="14"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.75" r="0.95" fill={color} />
    </svg>
  );
}
