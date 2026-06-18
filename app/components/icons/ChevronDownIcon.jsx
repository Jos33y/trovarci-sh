export default function ChevronDownIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M7 9.5L12 14.5L17 9.5" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
