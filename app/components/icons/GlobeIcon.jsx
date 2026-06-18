export default function GlobeIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 12H20.5" stroke={color} strokeWidth="1.4" />
      <path d="M12 3.5C14 6 15 9 15 12C15 15 14 18 12 20.5"
        stroke={color} strokeWidth="1.4" />
      <path d="M12 3.5C10 6 9 9 9 12C9 15 10 18 12 20.5"
        stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
