/** D36: what a double-click on a remote file should do. The editor reads at most 2 MB of UTF-8 text. */
export const EDIT_MAX_BYTES = 2 * 1024 * 1024

const BINARY_EXT = new Set(
  'gz tgz zip tar xz bz2 zst 7z rar jar war ear so bin iso img dmg png jpg jpeg gif webp bmp ico pdf mp4 mkv mov avi mp3 wav flac deb rpm apk exe dll class pyc o a woff woff2 ttf otf sqlite db'.split(' ')
)

export type OpenDecision = 'edit' | 'large' | 'binary'

export function openDecision(name: string, size: number): OpenDecision {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name ?? ''))
  if (m && BINARY_EXT.has(m[1]!.toLowerCase())) return 'binary'
  return size > EDIT_MAX_BYTES ? 'large' : 'edit'
}
