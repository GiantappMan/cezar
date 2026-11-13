import type { SyntheticEvent } from 'react'
import type { AutomationListEntry, AutomationWork } from '@open-mercato/cezar-api-client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { t, useLocale } from '@/lib/i18n'

/** The disclosure lines for what a paused automation still has in flight (#1980). */
export function pendingWorkLines(work: AutomationWork): string[] {
  const lines: string[] = []
  const continuing = work.queued.filter((run) => run.kind === 'continuation').length
  const fresh = work.queued.length - continuing
  if (work.queued.length) {
    const split = [fresh ? t('{n} never started', { n: fresh }) : '', continuing ? t('{n} continuing earlier work', { n: continuing }) : ''].filter(Boolean).join(', ')
    lines.push(t('{n} queued task{s} ({split}) will still start when a slot frees up, unless you cancel them.', {
      n: work.queued.length,
      s: work.queued.length === 1 ? '' : 's',
      split,
    }))
  }
  if (work.active.length) {
    lines.push(t('{n} task{s} {verb} running or waiting and will keep going — stop them from Tasks. They can no longer dispatch new subtasks.', {
      n: work.active.length,
      s: work.active.length === 1 ? '' : 's',
      verb: work.active.length === 1 ? 'is' : 'are',
    }))
  }
  return lines
}

export function hasPendingWork(work: AutomationWork): boolean {
  return work.queued.length > 0 || work.active.length > 0
}

/**
 * Shown when pausing an automation that still has work in flight, and from the menu of a paused
 * one. Pausing never cancels anything on its own: the queued tasks are cancelled only by the
 * explicit button, and running ones only from Tasks.
 */
export function PendingWorkDialog({
  automation,
  work,
  pausing,
  onOpenChange,
  onConfirm,
}: {
  automation: AutomationListEntry
  /** `undefined` closes the dialog. */
  work: AutomationWork | undefined
  /** `true` when the dialog guards a pause; `false` for an already-paused automation. */
  pausing: boolean
  onOpenChange: (open: boolean) => void
  /** Pause (when `pausing`), then cancel the queued tasks when `cancelQueued`. */
  onConfirm: (cancelQueued: boolean) => void
}) {
  useLocale()
  const stop = (event: SyntheticEvent) => event.stopPropagation()
  const lines = work ? pendingWorkLines(work) : []
  const queued = work?.queued.length ?? 0
  return (
    <AlertDialog open={work !== undefined} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={stop}>
        <AlertDialogHeader>
          <AlertDialogTitle>{pausing ? t('Pause “{name}”?', { name: automation.name }) : t('Work still pending for “{name}”', { name: automation.name })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{pausing ? t('Pausing stops new launches. Tasks it already started are not stopped:') : t('This automation is paused, but tasks it started earlier remain:')}</p>
              {lines.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              ) : <p>{t('Nothing is queued or running.')}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{pausing ? t('Cancel') : t('Close')}</AlertDialogCancel>
          {pausing ? <AlertDialogAction onClick={() => onConfirm(false)}>{t('Pause')}</AlertDialogAction> : null}
          {queued > 0 ? (
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:brightness-[0.96]"
              onClick={() => onConfirm(true)}
            >
              {pausing ? t('Pause and cancel {n} queued task{s}', { n: queued, s: queued === 1 ? '' : 's' }) : t('Cancel {n} queued task{s}', { n: queued, s: queued === 1 ? '' : 's' })}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
