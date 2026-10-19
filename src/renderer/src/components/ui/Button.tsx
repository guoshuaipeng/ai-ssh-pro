import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Icon from '../Icon'
import type { IconName } from '@shared/icon-registry'
import { CHROME_ICON_SIZE, CHROME_ICON_STROKE } from '../emptyIcons'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  /** When set with variant="icon", draws a chrome-sized linear glyph. */
  icon?: IconName
  children?: ReactNode
}

/**
 * Chrome button primitive. Prefer this over ad-hoc className="primary|ghost".
 * Styles come from design tokens via existing button.* rules (+ .ui-btn--icon).
 */
export default function Button({
  variant = 'secondary',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = ['ui-btn']
  if (variant === 'primary') classes.push('primary')
  else if (variant === 'ghost') classes.push('ghost')
  else if (variant === 'danger') classes.push('primary', 'danger')
  else if (variant === 'icon') classes.push('ui-btn--icon', 'ghost')
  else classes.push('secondary')
  if (className) classes.push(className)

  return (
    <button type={type} className={classes.join(' ')} {...rest}>
      {icon ? <Icon name={icon} size={CHROME_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} /> : null}
      {children}
    </button>
  )
}