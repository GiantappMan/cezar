import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { queryScope, type TrackerTrigger } from '@open-mercato/cezar-api-client'
import { getTrackerAutomationOptions } from '@/api/client'
import { Chip } from '@/components/chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { t, useLocale } from '@/lib/i18n'
import { TrackerLabelSuggestions } from './tracker-label-suggestions'
import { POLL_MINUTES } from './editor-draft'

export function EditorTrackerFields({ trigger, intervalSeconds, onChange, onValid }: {
  trigger: TrackerTrigger | undefined
  intervalSeconds: number
  onChange: (patch: { trackerTrigger?: TrackerTrigger; intervalSeconds?: number; enabled?: boolean }) => void
  onValid: (valid: boolean) => void
}) {
  useLocale()
  const [search, setSearch] = useState('')
  const scope = queryScope()
  // Keep connection/capability metadata independent of the changing search results.
  const metadata = useInfiniteQuery({
    queryKey: ['tracker', scope, 'automation-options', ''],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => getTrackerAutomationOptions({ ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    getNextPageParam: (last) => last.available ? last.nextCursor : undefined,
    retry: false,
  })
  const options = useInfiniteQuery({
    queryKey: ['tracker', scope, 'automation-options', search],
    enabled: !!search && metadata.data?.pages[0]?.available === true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => getTrackerAutomationOptions({ ...(search ? { search } : {}), ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    getNextPageParam: (last) => last.available ? last.nextCursor : undefined,
    retry: false,
  })
  const results = search ? options : metadata
  const first = metadata.data?.pages[0]
  const ready = first?.available ? first : undefined
  const sameSource = !!ready && !!trigger && JSON.stringify(ready.association) === JSON.stringify(trigger.association)
  const valid = !!trigger?.access && sameSource && !!trigger?.events.length && trigger.events.every(event => ready?.events.includes(event))
    && (trigger.requiredLabels?.length ?? 0) <= 100 && (trigger.requiredLabels ?? []).every(label => label.length > 0 && label.length <= 200)
    && (!trigger.events.includes('issue.status_changed') || !!trigger.targetStatusIds?.length)
    && (!(trigger.events.includes('issue.labeled') || trigger.events.includes('issue.unlabeled')) || !!trigger.changedLabelIds?.length)
  useEffect(() => { onValid(valid); return () => onValid(false) }, [valid, onValid])
  const pages = results.data?.pages.flatMap(page => page.available ? [page] : []) ?? []
  const statuses = [...new Map(pages.flatMap(page => page.statuses).map(item => [item.id, item])).values()]
  // A saved selection can be missing because of pagination, search, or a vendor change.
  // Keep it removable without inferring that it was deleted.
  const knownStatuses = new Map((metadata.data?.pages.flatMap(page => page.available ? page.statuses : []) ?? []).map(item => [item.id, item.name]))
  const hiddenSelectedStatuses = (trigger?.targetStatusIds ?? []).filter(id => !statuses.some(item => item.id === id))
  const labels = [...new Map(pages.flatMap(page => page.labels).map(item => [item.id, item])).values()]
  const wantsStatuses = trigger?.events.includes('issue.status_changed')
  const wantsLabels = trigger?.events.some(event => event === 'issue.labeled' || event === 'issue.unlabeled')
  const searchLabel = wantsStatuses && wantsLabels ? t('Search tracker statuses and labels') : wantsLabels ? t('Search tracker labels') : t('Search tracker statuses')
  return <div data-slot="editor-tracker" className="flex flex-col gap-3 text-sm">
    {metadata.isPending ? <p>{t('Loading tracker events…')}</p> : null}
    {metadata.isError || (first && !first.available) ? <div role="alert">
      <p>{first && !first.available ? first.reason : t('Could not load tracker events.')} {t('Check the project’s Issue tracker settings.')}</p>
      <Button variant="outline" size="sm" onClick={() => void metadata.refetch()}>{t('Retry')}</Button>
    </div> : null}
    {ready ? <>
      <p>{ready.association.kind === 'jira' ? 'Jira' : 'Linear'} · {ready.association.externalName}</p>
      {trigger && !sameSource ? <p role="alert">{t('The tracker connection changed. Select an event again before saving.')}</p> : null}
      {!trigger ? <p>{t('Select an event to complete this automation.')}</p> : null}
      <div role="group" aria-label={t('Tracker events')} className="flex flex-wrap gap-1.5">
        {ready.events.map(event => <Chip key={event} active={sameSource && trigger?.events.includes(event)} aria-pressed={sameSource && trigger?.events.includes(event)} onClick={() => {
          const current = sameSource ? trigger!.events : []
          const events = current.includes(event) ? current.filter(item => item !== event) : [...current, event]
          // A rotated connection keeps the user's reviewed grants; only a brand-new trigger starts read-only.
          const access = trigger?.access ?? (!trigger ? { version: 1 as const, writes: [] } : undefined)
          const nextTrigger: TrackerTrigger = { ...(sameSource ? trigger : {}), ...(access ? { access } : {}), association: ready.association, events }
          if (event === 'issue.status_changed' && !events.includes(event)) delete nextTrigger.targetStatusIds
          onChange({ trackerTrigger: nextTrigger, ...(!sameSource ? { enabled: false } : {}) })
        }}>{event}</Chip>)}
      </div>
      {sameSource && trigger ? <TrackerLabelSuggestions key={JSON.stringify(ready.association)} association={ready.association} selected={trigger.requiredLabels ?? []} onRemove={label => onChange({ trackerTrigger: { ...trigger, requiredLabels: (trigger.requiredLabels ?? []).filter(value => value !== label) } })} onSelect={label => onChange({ trackerTrigger: { ...trigger, requiredLabels: [...new Set([...(trigger.requiredLabels ?? []), label])] } })} /> : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t('Integration details')}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>{t('Label choices come from loaded tasks in this project, including closed tasks. Saved selections remain available.')}</p>
          {ready.limitations.map(note => <p key={note}>{note}</p>)}
        </div>
      </details>
      {trigger?.events.some(event => event !== 'issue.opened') ? <>
        <Input aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={e => setSearch(e.target.value)} />
        {results.isFetching ? <p role="status">{t('Searching…')}</p> : null}
        {results.isError || (results.data?.pages[0] && !results.data.pages[0].available) ? <div role="alert">{t('Could not load search results.')} <Button variant="outline" size="sm" onClick={() => void results.refetch()}>{t('Retry search')}</Button></div> : null}
        {!results.isFetching && results.data?.pages[0]?.available && wantsStatuses && statuses.length === 0 ? <p>{t('No matching statuses.')}</p> : null}
        {!results.isFetching && results.data?.pages[0]?.available && wantsLabels && labels.length === 0 ? <p>{t('No matching labels.')}</p> : null}
        {trigger.events.includes('issue.status_changed') ? <div role="group" aria-label={t('Target statuses')} className="flex flex-wrap gap-1.5">
          {statuses.map(item => <Chip key={item.id} active={trigger.targetStatusIds?.includes(item.id)} aria-pressed={trigger.targetStatusIds?.includes(item.id)} onClick={() => {
            const ids = trigger.targetStatusIds ?? []
            onChange({ trackerTrigger: { ...trigger, targetStatusIds: ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id] } })
          }}>{item.name}</Chip>)}
          {hiddenSelectedStatuses.map(id => <Chip key={id} active aria-pressed={true} onClick={() => {
            onChange({ trackerTrigger: { ...trigger, targetStatusIds: (trigger.targetStatusIds ?? []).filter(value => value !== id) } })
          }}>{t('{name} (not in current results)', { name: knownStatuses.get(id) ?? id })}</Chip>)}
        </div> : null}
        {trigger.events.some(event => event === 'issue.labeled' || event === 'issue.unlabeled') ? <div role="group" aria-label={t('Changed labels')} className="flex flex-wrap gap-1.5">
          {labels.map(item => <Chip key={item.id} active={trigger.changedLabelIds?.includes(item.id)} aria-pressed={trigger.changedLabelIds?.includes(item.id)} onClick={() => {
            const ids = trigger.changedLabelIds ?? []
            onChange({ trackerTrigger: { ...trigger, changedLabelIds: ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id] } })
          }}>{item.name}</Chip>)}
        </div> : null}
        {results.hasNextPage ? <Button variant="outline" size="sm" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>{t('Load more')}</Button> : null}
      </> : null}
    </> : null}
    <div className="flex items-center gap-2">{t('Check every')}
      <Select value={String(intervalSeconds / 60)} onValueChange={value => onChange({ intervalSeconds: Number(value) * 60 })}>
        <SelectTrigger aria-label={t('Tracker poll interval')} className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>{POLL_MINUTES.map(minutes => <SelectItem key={minutes} value={String(minutes)}>{t('{n} min', { n: minutes })}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {trigger && sameSource ? <fieldset className="flex flex-col gap-2">
      <legend>{t('Tracker access')}</legend>
      {!trigger.access ? <div role="alert">{t('This automation previously gave its agent a tracker token. Review the prompt: only reading this issue, comments and status transitions are now supported. Other operations need a revised workflow.')}
        <Button type="button" variant="outline" onClick={() => onChange({ trackerTrigger: { ...trigger, access: { version: 1, writes: [] } } })}>{t('Confirm migration to read-only access')}</Button>
      </div> : <>
        <p>{t('Fresh issue details and accessible comments are read by cezar. Attachments and custom fields are not included. Tokens stay with cezar.')}</p>
        {(['comment', 'transition'] as const).map(operation => <label key={operation} className="flex gap-2"><input type="checkbox" checked={trigger.access!.writes.includes(operation)} onChange={e => onChange({ trackerTrigger: { ...trigger, access: { version: 1, writes: e.target.checked ? [...trigger.access!.writes, operation] : trigger.access!.writes.filter(value => value !== operation) } } })} />{t('Allow agent to {action} on this issue without further approval', { action: operation === 'comment' ? t('post comments') : t('change status') })}</label>)}
      </>}
    </fieldset> : null}
    <p className="text-xs text-muted-foreground">{t('Only events after enabling are eligible. Existing backlog is not launched. Use a token with minimal read permissions; grant provider write permissions only for selected write actions.')}</p>
  </div>
}
