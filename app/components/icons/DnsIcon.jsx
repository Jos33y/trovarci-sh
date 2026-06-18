export default function DnsIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3" y="4" width="18" height="5" rx="1.5" stroke={color} strokeWidth="1.6" />
      <rect x="3" y="15" width="18" height="5" rx="1.5" stroke={color} strokeWidth="1.6" />
      <circle cx="6.5" cy="6.5" r="1" fill={color} />
      <circle cx="6.5" cy="17.5" r="1" fill={color} />
      <path d="M10 6.5H18" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 17.5H18" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 9V15" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2" />
    </svg>
  );
}
