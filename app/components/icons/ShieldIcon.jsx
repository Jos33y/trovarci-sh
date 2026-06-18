export default function ShieldIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 3L4 7V12C4 16.4 7.4 20.5 12 21.5C16.6 20.5 20 16.4 20 12V7L12 3Z"
        stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12L11 14L15 10" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
