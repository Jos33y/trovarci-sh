export default function MenuIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4 7H20M4 12H20M4 17H20" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" />
    </svg>
  );
}
