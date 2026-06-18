export default function PhoneIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="6" y="3" width="12" height="18" rx="2.5" stroke={color} strokeWidth="1.6" />
      <path d="M10 6H14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill={color} />
    </svg>
  );
}
