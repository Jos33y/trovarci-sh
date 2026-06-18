export default function BoltIcon({ size = 24, color = "currentColor", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M13 2L4.5 13H11L9 22L19.5 10H12.5L13 2Z" fill={color} />
    </svg>
  );
}
