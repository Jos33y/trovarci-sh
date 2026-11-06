export default function ReadingIcon({ size = 24, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 5.5 C6 4.5 9 4.8 12 6.5 C15 4.8 18 4.5 21 5.5 V18.5 C18 17.5 15 17.8 12 19.5 C9 17.8 6 17.5 3 18.5 Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 6.5 V19.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
