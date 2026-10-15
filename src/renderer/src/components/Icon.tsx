import { ICON_PATHS, type IconName } from '@shared/icon-registry'

type Props = {
  name: IconName
  size?: number
  title?: string
}

/** Linear icon. Color follows currentColor; do not set a fill. */
export default function Icon({ name, size = 16, title }: Props) {
  return (
    <svg
      className="aiss-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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
