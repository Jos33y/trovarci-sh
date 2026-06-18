export default function ArrowLeftIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M19 12H5M5 12L11 6M5 12L11 18" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
