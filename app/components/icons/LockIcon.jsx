export default function LockIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="4"
        y="10"
        width="16"
        height="12"
        rx="2.5"
        stroke={color}
        strokeWidth="1.8"
      />
      <path
        d="M8 10V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V10"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1.5" fill={color} />
    </svg>
  );
}
