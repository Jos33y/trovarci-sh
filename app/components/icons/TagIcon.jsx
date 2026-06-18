export default function TagIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4 5.5C4 4.67 4.67 4 5.5 4H10.17C10.7 4 11.21 4.21 11.59 4.59L19.41 12.41C20.2 13.2 20.2 14.47 19.41 15.25L15.25 19.41C14.47 20.2 13.2 20.2 12.41 19.41L4.59 11.59C4.21 11.21 4 10.7 4 10.17V5.5Z"
        stroke={color} strokeWidth="1.6" />
      <circle cx="7.5" cy="7.5" r="1.25" fill={color} />
    </svg>
  );
}
