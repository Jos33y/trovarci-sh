export default function VerifyIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M9 12L11.25 14.25L15 9.75" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3.5" y="5" width="17" height="14" rx="2" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 9H20.5" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
