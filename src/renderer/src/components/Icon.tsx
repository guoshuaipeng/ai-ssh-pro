import { ICON_PATHS, type IconName } from '@shared/icon-registry'

type Props = {
  name: IconName
  size?: number
  title?: string
  /** Chrome + empty share 1.5; pass strokeWidth only for rare emphasis. */
  strokeWidth?: number
}

/** Linear icon. Color follows currentColor; do not set a fill. */
export default function Icon({ name, size = 16, title, strokeWidth = 1.5 }: Props) {
  return (
    <svg
      className="aiss-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

/** Disclosure triangle. Same glyph for folders, trees, and overflow rows. */
export function Twist({ open, size = 12 }: { open: boolean; size?: number }) {
  return <Icon name={open ? 'chevron-down' : 'chevron-right'} size={size} />
}
