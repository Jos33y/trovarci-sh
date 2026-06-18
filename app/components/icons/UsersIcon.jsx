export default function UsersIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="9" cy="7" r="3.5" stroke={color} strokeWidth="1.8" />
      <path
        d="M2 19.5C2 16.5 5 14.5 9 14.5C13 14.5 16 16.5 16 19.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17" cy="8.5" r="2.5" stroke={color} strokeWidth="1.8" />
      <path
        d="M18 14.5C20.5 15 22 16.5 22 19"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
