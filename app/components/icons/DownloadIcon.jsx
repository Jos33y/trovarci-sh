export default function DownloadIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 4V16M12 16L7 11M12 16L17 11" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 18H20" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
