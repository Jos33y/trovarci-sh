export default function KeyIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="8" cy="15" r="4.5" stroke={color} strokeWidth="1.8" />
      <circle cx="8" cy="15" r="1.4" fill={color} />
      <path d="M11.3 11.7L20 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 6.5L19 9M14.5 8.5L16.5 10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
