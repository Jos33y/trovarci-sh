export default function RouteIcon({ size = 24, color = 'currentColor', className }) {
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
      <circle cx="5" cy="6" r="2" stroke={color} strokeWidth="1.8" />
      <path
        d="M7 6 H14 V18 H17"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="18" r="2" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}
