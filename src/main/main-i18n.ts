/**
 * Picks the message matching the UI locale for strings produced in the main process.
 * Kept free of electron imports (tests import ssh-manager); index.ts wires the locale getter.
 */
let localeGetter: () => string = () => 'zh-CN'

export function setMainLocaleGetter(fn: () => string): void {
  localeGetter = fn
}

export function mt(zh: string, en: string): string {
  try {
    return localeGetter() === 'zh-CN' ? zh : en
  } catch {
    return zh
  }
}
