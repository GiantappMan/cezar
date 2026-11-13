import type { QueueWaitReason } from '@open-mercato/cezar-api-client'
import { t } from '@/lib/i18n'
/** The zone is always named (spec 2026-10-07 § times): the server's when known, else the browser's. */
export function queueWaitLabel(reason: QueueWaitReason | undefined, timeZone?: string): string | undefined {
  if (!reason) return undefined
  if (reason.kind === 'account-resume') return t("Waiting for this account's automatic resume")
  timeZone ??= reason.timeZone
  const until = new Date(reason.until)
  const time = timeZone
    ? `${until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })} · ${timeZone}`
    : until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  return t('Waiting for usage limit reset · {time}', { time })
}
