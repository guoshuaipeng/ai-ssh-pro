import { useEffect, useState } from 'react'
import { elapsedSec } from '@shared/connect-timeout'
import { useI18n } from '../lib/i18n'

/** D77: "12s / 20s" next to the connecting banner; ticks every second. */
export default function ConnectingElapsed({ since, timeoutSec }: { since: number; timeoutSec: number }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const sec = elapsedSec(since, now)
  return (
    <span className="session-connecting-elapsed" data-testid="connecting-elapsed" title={t('d77.elapsedTip')}>
      {t('d77.elapsed', { sec: String(sec), max: String(timeoutSec) })}
    </span>
  )
}
