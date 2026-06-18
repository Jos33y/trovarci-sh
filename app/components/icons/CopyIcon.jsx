export default function CopyIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke={color} strokeWidth="1.6" />
      <path d="M5 15V5C5 3.9 5.9 3 7 3H15" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
