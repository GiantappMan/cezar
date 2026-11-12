import {
  WEEKDAY_NAMES,
  hm,
  scheduleLabel,
  schedulesOf,
  zonedParts,
  type AutomationDefinition,
  type RunStatus,
} from '@open-mercato/cezar-api-client'

import type { StatusDotTone } from '@/components/status-dot'
import { t } from '@/lib/i18n'

/**
 * The Automations surface's small formatting vocabulary (spec 2026-09-14-automations-redesign
 * § UI/UX). Every time shown on the page is rendered in the SERVER's zone — the one the
 * schedules are evaluated in — never the browser's, so a cockpit opened from another zone shows
 * the same "Thu 04:00" the timer will fire at.
 */

export { hm }

/**
 * Whether the Automations screens show dollar figures at all (owner decision, 2026-09-15:
 * hidden for now). The server keeps answering `costUsd` / `costUsd7d` / `stats.costUsd` under
 * `capabilities.costMetrics`; flipping this back to `true` restores the spent figure, the
 * Cost 7d column, and the cost cells of the log and the last-run card.
 */
export const AUTOMATION_COST_VISIBLE = false

/** `Mon` … `Sun` for an ISO weekday (Monday = 1). */
export function dayName(weekday: number): string {
  return t(WEEKDAY_NAMES[((weekday - 1) % 7 + 7) % 7] ?? '')
}

/** `Thu 04:00` in the zone; `''` for an unknown zone or a bad instant. */
export function dayTime(iso: string | number, timeZone: string): string {
  const parts = zonedParts(typeof iso === 'number' ? iso : Date.parse(iso), timeZone)
  return parts ? `${dayName(parts.weekday)} ${hm(parts.hour, parts.minute)}` : ''
}

/** `HH:MM` in the zone. */
export function timeOnly(iso: string | number, timeZone: string): string {
  const parts = zonedParts(typeof iso === 'number' ? iso : Date.parse(iso), timeZone)
  return parts ? hm(parts.hour, parts.minute) : ''
}

/** The log row's stamp: `Wed 04:00` within the last six days, `12 Sep 04:00` beyond. */
export function logTime(iso: string, timeZone: string, now = Date.now()): string {
  const ms = Date.parse(iso)
  const parts = zonedParts(ms, timeZone)
  if (!parts) return ''
  if (now - ms < 6 * 86_400_000) return `${dayName(parts.weekday)} ${hm(parts.hour, parts.minute)}`
  const stamp = hm(parts.hour, parts.minute)
  return t('{day} {month} {time}', {
    day: String(parts.day),
    month: t(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parts.month - 1] ?? ''),
    time: stamp,
  })
}

/** `in 12m` / `in 3h` / `in 2d` — the rail's and the preview's relative column. */
export function relativeIn(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((ms - now) / 60_000))
  if (minutes < 60) return t('in {n}m', { n: minutes })
  if (minutes < 1_440) return t('in {n}h', { n: Math.round(minutes / 60) })
  return t('in {n}d', { n: Math.round(minutes / 1_440) })
}

/** `4h 12m` / `12m` / `0m` — the strip's agent time. */
export function agentTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0
    ? t('{h}h {m}m', { h: hours, m: String(minutes % 60).padStart(2, '0') })
    : t('{m}m', { m: minutes })
}

/** `$13.4` above ten dollars, `$2.41` below — the design's two spellings. */
export function usd(value: number): string {
  return value >= 10 ? `$${value.toFixed(1)}` : `$${value.toFixed(2)}`
}

/** The dot beside a run's state: done → success, running → pending, failed → danger, review → violet. */
export function statusTone(status: RunStatus): StatusDotTone {
  switch (status) {
    case 'done': return 'success'
    case 'running': case 'queued': case 'waiting': return 'pending'
    case 'failed': case 'cancelled': return 'danger'
    case 'review': return 'violet'
  }
}

/** The word beside that dot. */
export function statusLabel(status: RunStatus): string {
  switch (status) {
    case 'review': return t('needs review')
    case 'waiting': return t('needs you')
    // The raw server enum is displayed verbatim here; t() covers each spelling.
    default: return t(status)
  }
}

/** The trigger cell: `on issue.opened · every 5 min` for a poll, `scheduleLabel` for a schedule. */
export function triggerLabel(automation: Pick<AutomationDefinition, 'kind' | 'events' | 'intervalSeconds' | 'schedule' | 'schedules' | 'trackerTrigger'>): string {
  if (automation.kind === 'schedule') return schedulesOf(automation).map(scheduleLabel).join('; ')
  if (automation.kind === 'tracker') {
    const trigger = automation.trackerTrigger
    const provider = trigger?.association.kind === 'jira' ? 'Jira' : trigger?.association.kind === 'linear' ? 'Linear' : t('Tracker')
    if (!trigger) return `${provider} · ${t('select an event to complete setup')}`
    const tail = t('· every {n} min', { n: Math.round((automation.intervalSeconds ?? 1800) / 60) })
    const labels = trigger.changedLabelIds?.length ? ` · ${t('labels {ids}', { ids: trigger.changedLabelIds.join(', ') })}` : ''
    const targets = trigger.targetStatusIds?.length ? ` → ${trigger.targetStatusIds.join(', ')}` : ''
    return `${provider} · ${trigger.events.join(', ')}${targets}${labels} ${tail}`
  }
  const events = (automation.events ?? []).join(', ')
  const minutes = Math.round((automation.intervalSeconds ?? 300) / 60)
  return t('on {events} · every {n} min', { events: events || 'github', n: minutes })
}

/** The log result's dot tone (spec § UI/UX 5). */
export function resultTone(result: string): StatusDotTone {
  switch (result) {
    case 'launched': case 'manual': case 'catch-up': return 'success'
    case 'failed': case 'error': case 'rate-limited': return 'danger'
    default: return 'neutral'
  }
}
