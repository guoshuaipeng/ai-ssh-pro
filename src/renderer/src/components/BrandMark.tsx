/** Linear app mark shared by the welcome card (48) and later the about page (32). */
export default function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="9" width="34" height="24" rx="3" />
      <path d="M7 16h34" />
      <path d="M14 23l5 4-5 4" />
      <path d="M23 31h10" />
      <path d="M18 39h12" />
    </svg>
  )
}
