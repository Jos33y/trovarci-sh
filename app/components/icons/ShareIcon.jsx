export default function ShareIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="18" cy="5" r="2.5" stroke={color} strokeWidth="1.6" />
      <circle cx="6" cy="12" r="2.5" stroke={color} strokeWidth="1.6" />
      <circle cx="18" cy="19" r="2.5" stroke={color} strokeWidth="1.6" />
      <path d="M8.25 10.85L15.75 6.15M8.25 13.15L15.75 17.85" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
