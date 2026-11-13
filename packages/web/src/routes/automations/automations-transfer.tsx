import { useQueryClient } from '@tanstack/react-query'
import { DownloadIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type {
  AutomationImportPreview,
  AutomationImportResolutions,
  AutomationImportRow,
  AutomationsFile,
} from '@open-mercato/cezar-api-client'

import { exportAutomations, importAutomations, previewAutomationImport } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toaster'
import { t, useLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import { automationsQueryKey } from './use-automations'

/** Export / import (spec 2026-11-04-automations-and-config-export-import § UI/UX). */

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Downloads every automation of the active project — the list has no selection to narrow it. */
export function ExportAutomationsButton({ disabled }: { disabled?: boolean }) {
  useLocale()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const file = await exportAutomations()
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `cezar-automations-${file.exportedAt.slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      toast(message(error), { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" className="shrink-0" data-action="automations-export" disabled={disabled || busy} onClick={() => void run()}>
      <DownloadIcon className="size-[15px]" />
      {t('Export')}
    </Button>
  )
}

export function ImportAutomationsButton() {
  useLocale()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" className="shrink-0" data-action="automations-import" onClick={() => setOpen(true)}>
        <UploadIcon className="size-[15px]" />
        {t('Import')}
      </Button>
      <ImportAutomationsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

type Choice = 'skip' | 'rename' | 'replace'
interface RowChoice {
  action?: Choice
  acceptCommands?: boolean
}

/**
 * The request's resolutions from the user's per-row choices. A row with no collision has no action
 * to pick; its `acceptCommands` rides an explicit `create`.
 */
export function resolutionsOf(rows: AutomationImportRow[], choices: Record<number, RowChoice>): AutomationImportResolutions {
  const out: AutomationImportResolutions = {}
  for (const row of rows) {
    const choice = choices[row.index]
    if (!choice) continue
    if (row.collision) {
      if (!choice.action) continue
      out[String(row.index)] = {
        action: choice.action,
        ...(choice.action !== 'skip' && choice.acceptCommands ? { acceptCommands: true } : {}),
      }
    } else if (choice.acceptCommands) {
      out[String(row.index)] = { action: 'create', acceptCommands: true }
    }
  }
  return out
}

const ACTION_CHIP: Record<AutomationImportRow['action'], { label: string; className: string }> = {
  create: { label: 'Create', className: 'border-success/40 text-success' },
  rename: { label: 'Rename', className: 'border-primary/40 text-primary' },
  replace: { label: 'Replace', className: 'border-warning/40 text-warning' },
  skip: { label: 'Skip', className: 'text-muted-foreground' },
}

export function confirmLabel(rows: AutomationImportRow[]): string {
  const replaces = rows.filter((row) => row.action === 'replace').length
  const creates = rows.filter((row) => row.action === 'create' || row.action === 'rename').length
  const noun = (n: number) => t('{n} automation{s}', { n, s: n === 1 ? '' : 's' })
  if (!replaces) return t('Import {n} automation{s} (paused)', { n: creates, s: creates === 1 ? '' : 's' })
  if (!creates) return t('Replace {n} automation{s} (paused)', { n: replaces, s: replaces === 1 ? '' : 's' })
  return t('Import {n} automation{s} and replace {m} (paused)', { n: creates, s: creates === 1 ? '' : 's', m: replaces })
}

export function ImportAutomationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useLocale()
  const queryClient = useQueryClient()
  const inputId = useId()
  const [file, setFile] = useState<AutomationsFile | null>(null)
  const [choices, setChoices] = useState<Record<number, RowChoice>>({})
  const [preview, setPreview] = useState<AutomationImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A 409 on apply: the plan is stale or blocked — offer a fresh preview. */
  const [conflict, setConflict] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [reviewKey, setReviewKey] = useState(0)
  const requestId = useRef(0)

  const reset = () => {
    requestId.current++
    setFile(null)
    setChoices({})
    setPreview(null)
    setError(null)
    setConflict(null)
    setPreviewing(false)
    setImporting(false)
  }

  const resolutions = preview ? resolutionsOf(preview.rows, choices) : {}
  const resolutionsKey = JSON.stringify(resolutions)

  useEffect(() => {
    if (!file) return
    const id = ++requestId.current
    setPreviewing(true)
    previewAutomationImport({ file, ...(resolutionsKey === '{}' ? {} : { resolutions: JSON.parse(resolutionsKey) as AutomationImportResolutions }) })
      .then((next) => {
        if (id !== requestId.current) return
        setPreview(next)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (id !== requestId.current) return
        setPreview(null)
        setError(message(cause))
      })
      .finally(() => {
        if (id === requestId.current) setPreviewing(false)
      })
  }, [file, resolutionsKey, reviewKey])

  const pick = async (picked: File | undefined) => {
    reset()
    if (!picked) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await picked.text())
    } catch {
      setError(t('"{name}" is not valid JSON — pick a file cezar exported.', { name: picked.name }))
      return
    }
    // The server validates the shape; anything that parsed goes to the preview as-is.
    setFile(parsed as AutomationsFile)
  }

  const rows = preview?.rows ?? []
  const blocked = rows.some((row) => row.action !== 'skip' && row.issues.length > 0)
  const applying = rows.filter((row) => row.action !== 'skip').length

  const apply = async () => {
    if (!file || !preview) return
    setImporting(true)
    setConflict(null)
    try {
      const result = await importAutomations({
        file,
        ...(Object.keys(resolutions).length ? { resolutions } : {}),
        planDigest: preview.planDigest,
      })
      const landed = result.created.length + result.replaced.length
      toast(t('Imported {n} automation{s}, paused.', { n: landed, s: landed === 1 ? '' : 's' }))
      void queryClient.invalidateQueries({ queryKey: automationsQueryKey() })
      reset()
      onOpenChange(false)
    } catch (cause) {
      setConflict(message(cause))
    } finally {
      setImporting(false)
    }
  }

  const setChoice = (index: number, patch: RowChoice) =>
    setChoices((current) => ({ ...current, [index]: { ...current[index], ...patch } }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent data-slot="automations-import" className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('Import automations')}</DialogTitle>
          <DialogDescription>
            {t('Pick a file exported from cezar. Nothing is written until you confirm, and every imported automation lands paused.')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">{t('Automations file')}</label>
          <input
            id={inputId}
            type="file"
            accept=".json,application/json"
            data-slot="automations-import-file"
            onChange={(event) => void pick(event.target.files?.[0])}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        {error ? (
          <p role="alert" data-slot="automations-import-error" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {preview ? (
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('This file has no automations.')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table data-slot="automations-import-preview" aria-busy={previewing} className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">{t('Name')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('Kind')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('Action')}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t('Notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PreviewRow
                      key={row.index}
                      row={row}
                      choice={choices[row.index] ?? {}}
                      onChoice={(patch) => setChoice(row.index, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : previewing ? (
          <p role="status" className="text-sm text-muted-foreground">{t('Reading the file…')}</p>
        ) : null}

        {conflict ? (
          <div role="alert" data-slot="automations-import-conflict" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="min-w-0 flex-1">{conflict}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConflict(null)
                setReviewKey((n) => n + 1)
              }}
            >
              {t('Review again')}
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>{t('Cancel')}</Button>
          <Button
            data-action="automations-import-confirm"
            disabled={!preview || previewing || importing || blocked || applying === 0 || conflict !== null}
            onClick={() => void apply()}
          >
            {confirmLabel(rows)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewRow({ row, choice, onChoice }: { row: AutomationImportRow; choice: RowChoice; onChoice: (patch: RowChoice) => void }) {
  useLocale()
  const action = row.action
  const chip = ACTION_CHIP[action]
  const renamed = row.newName ?? `${row.name} (imported)`
  const selectId = useId()
  return (
    <tr data-row={row.index} className={cn('border-t border-border align-top', row.action === 'skip' && 'text-muted-foreground')}>
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{row.name}</div>
        {row.runsCommands ? (
          <Badge variant="outline" className="mt-1 border-warning/40 text-warning">
            <TriangleAlertIcon aria-hidden />
            {t('runs shell commands')}
          </Badge>
        ) : null}
      </td>
      <td className="px-3 py-2 capitalize">{row.kind}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1.5">
          <Badge variant="outline" data-action-chip={action} className={chip.className}>{t(chip.label)}</Badge>
          {row.collision ? (
            <>
              <label htmlFor={selectId} className="sr-only">{t('Action for {name}', { name: row.name })}</label>
              <select
                id={selectId}
                value={choice.action ?? row.action}
                onChange={(event) => onChoice({ action: event.target.value as Choice })}
                className="block w-full min-w-44 rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="skip">{t('Skip')}</option>
                <option value="rename">{t('Rename to "{name}"', { name: renamed })}</option>
                {row.collision.id ? <option value="replace">{t('Replace')}</option> : null}
              </select>
            </>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2">
        <ul className="flex flex-col gap-1 text-xs">
          {row.collision && row.action === 'skip' ? (
            <li className="text-muted-foreground">{t('An automation named "{name}" already exists.', { name: row.collision.name })}</li>
          ) : null}
          {row.action === 'replace' && row.collision ? (
            <li className="text-warning">{t('Replaces and pauses "{name}".', { name: row.collision.name })}</li>
          ) : null}
          {row.action === 'rename' && row.collision ? <li>{t('Lands as "{name}".', { name: renamed })}</li> : null}
          {row.issues.map((issue) => <li key={issue} className="text-destructive">{issue}</li>)}
          {row.warnings.map((warning) => <li key={warning} className="text-warning">{warning}</li>)}
        </ul>
        {row.runsCommands && row.action !== 'skip' ? (
          <label className="mt-1.5 flex items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={choice.acceptCommands === true}
              onChange={(event) => onChoice({ acceptCommands: event.target.checked })}
              className="mt-0.5 accent-primary"
            />
            {t('I reviewed its shell commands and allow them to run')}
          </label>
        ) : null}
      </td>
    </tr>
  )
}
