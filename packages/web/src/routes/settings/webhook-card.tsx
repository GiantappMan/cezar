import { useHealth } from '@/api/queries'
import { t, useLocale } from '@/lib/i18n'
import { Link, useActiveProjectId } from '@/lib/project-router'
import { useWebhookList } from '@/hooks/use-webhooks'
import { LoadingState } from '@/components/loading-state'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsField } from './settings-field'
export function WebhookCard() {
  useLocale()
  const health = useHealth()
  const enabled = !health.isError && health.data?.capabilities?.webhooks === true
  const unsupported = health.data?.capabilities?.webhooksUnavailableReason === 'unsupported_platform'
  const projectId = useActiveProjectId() ?? 'default'
  const list = useWebhookList(projectId, enabled)
  const rows = list.data?.receivers ?? []
  const attention = rows.filter(row => ['suspended', 'disabled'].includes(row.state)).length
  const inactive = rows.filter(row => row.state === 'inactive').length
  const pending = rows.reduce((total, row) => total + row.pendingCount, 0)
  return <SettingsField title={t('Webhooks')} hint={t('Task updates sent to Slack, Discord or your own endpoint.')}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border bg-card p-3 text-ui">
      <div className="min-w-0">
        {health.isError ? <p>{t('Status unavailable — could not load server health.')}</p>
          : !health.data ? <LoadingState label={t('Loading webhook status…')}><Skeleton className="my-1 h-3.5 w-44" /></LoadingState>
          : unsupported ? <p>{t('Not available on this server’s platform.')}</p>
          : !enabled ? <p>{t('Off on this server.')}</p>
          : list.isPending ? <LoadingState label={t('Loading receivers…')}><Skeleton className="my-1 h-3.5 w-44" /></LoadingState>
          : list.error ? <p className="text-danger">{t('Status unavailable — open Webhooks for details.')}</p>
          : !rows.length ? <p>{t('No receivers yet.')}</p>
          : <p>{t('{n} active', { n: rows.filter(row => row.state === 'active').length })} · {t('{n} paused', { n: rows.filter(row => row.state === 'paused').length })}{inactive ? ` · ${t('{n} inactive', { n: inactive })}` : ''}{attention ? <> · <span className="text-warning">{t('{n} need attention', { n: attention })}</span></> : ''}{pending ? ` · ${t('{n} pending', { n: pending })}` : ''}</p>}
        {enabled && !unsupported && !list.error && list.data?.webhookHealth && ['degraded', 'unavailable'].includes(list.data.webhookHealth.status) && <p role="status" className="text-warning">{list.data.webhookHealth.reason || t('Webhook delivery needs attention. Open Webhooks for details.')}</p>}
      </div>
      <Link className="shrink-0 underline underline-offset-2 hover:text-foreground" to="/settings/webhooks">{enabled && !unsupported ? t('Manage webhooks') : t('Open webhook settings')}</Link>
    </div>
  </SettingsField>
}
