export default function LayersIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2 12L12 6L22 12L12 18L2 12Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M2 16L12 22L22 16"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M2 8L12 2L22 8"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}
