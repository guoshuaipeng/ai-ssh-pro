/** Local, offline heuristics for commands that can cause irreversible damage. Not a sandbox. */
export type CommandRisk = { level: 'high'; reasonKey: RiskReasonKey } | null

export type RiskReasonKey =
  | 'risk.rmRoot'
  | 'risk.mkfs'
  | 'risk.dd'
  | 'risk.forkbomb'
  | 'risk.power'
  | 'risk.chmod'
  | 'risk.dropdb'
  | 'risk.firewall'
  | 'risk.rmrf'
  | 'risk.kill'

const SYS_DIRS = '(?:/|/\\*|~|~/|\\$HOME|/(?:bin|boot|dev|etc|home|lib|lib64|opt|root|sbin|srv|usr|var)(?:/\\*?)?)'

const RULES: Array<[RegExp, RiskReasonKey]> = [
  [new RegExp(`\\brm\\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\\s+|--recursive\\s+|-[a-zA-Z]+\\s+)*(?:--no-preserve-root\\s+)?${SYS_DIRS}(?=\\s|;|&|\\||$)`), 'risk.rmRoot'],
  [/\bmkfs(?:\.\w+)?\b/, 'risk.mkfs'],
  [/\bdd\b[^|;&]*\bof=\/dev\/(?!null\b|zero\b)/, 'risk.dd'],
  [/>\s*\/dev\/(?:sd[a-z]|nvme\d|vd[a-z]|xvd[a-z]|hd[a-z])/, 'risk.dd'],
  [/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, 'risk.forkbomb'],
  [/(?:^|[;&|]\s*|\bsudo\s+)(?:shutdown|reboot|halt|poweroff|init\s+[06])\b/, 'risk.power'],
  [/\bchmod\s+(?:-[a-zA-Z]*R[a-zA-Z]*\s+)\S+\s+\/(?:\s|$)/, 'risk.chmod'],
  [/\bdrop\s+(?:database|schema|table)\b/i, 'risk.dropdb'],
  [/\btruncate\s+table\b/i, 'risk.dropdb'],
  [/\biptables\s+(?:-F|--flush)\b|\bufw\s+reset\b|\bnft\s+flush\s+ruleset\b/, 'risk.firewall'],
  [/\bkill(?:all)?\s+-9\s+-1\b|\bpkill\s+-9\s+-u\b/, 'risk.kill'],
]

export function assessCommandRisk(command: string): CommandRisk {
  const s = String(command ?? '').trim()
  if (!s) return null
  for (const [re, reasonKey] of RULES) if (re.test(s)) return { level: 'high', reasonKey }
  return null
}
