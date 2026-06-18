export default function GaugeIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20Z"
        stroke={color} strokeWidth="1.6" />
      <path d="M12 12L15.5 8.5" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
}
