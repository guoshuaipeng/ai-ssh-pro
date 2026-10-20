/** D58: local files opened with the system default app. Executables and scripts are never launched from here. */
const RUNNABLE = new Set(
  'exe com bat cmd ps1 psm1 vbs vbe js jse wsf wsh msi msp scr pif lnk url hta cpl jar reg sh bash zsh command app run bin appimage desktop py pl rb'.split(' ')
)

export function isRunnableName(name: string): boolean {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name ?? ''))
  return Boolean(m && RUNNABLE.has(m[1]!.toLowerCase()))
}
