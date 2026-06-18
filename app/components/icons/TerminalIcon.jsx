export default function TerminalIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.6" />
      <path d="M7 9L10 12L7 15" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 15H17" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
