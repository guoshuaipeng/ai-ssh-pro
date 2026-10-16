import { APP_MARK_PATH, EMPTY_ICON_STROKE } from './emptyIcons'

/** Same face on the welcome card (48) and the about page (32). */
export default function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={EMPTY_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={APP_MARK_PATH} />
    </svg>
  )
}
