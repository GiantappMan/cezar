import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LOCALE_STORAGE_KEY,
  readLocalePref,
  resolveLocale,
  t,
  useLocale,
  writeLocalePref,
} from './i18n'
import { zhCN } from './i18n.zh-cn'

/** Shadow only `language` — replacing the whole navigator breaks react-dom's userAgent reads. */
function stubBrowserLanguage(language: string | undefined): void {
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  stubBrowserLanguage('en-US')
})

afterEach(() => {
  writeLocalePref('auto')
})

describe('readLocalePref', () => {
  it('defaults to auto', () => {
    expect(readLocalePref()).toBe('auto')
  })

  it('round-trips zh and en and rejects unknown values', () => {
    writeLocalePref('zh')
    expect(readLocalePref()).toBe('zh')
    writeLocalePref('en')
    expect(readLocalePref()).toBe('en')
    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon')
    expect(readLocalePref()).toBe('auto')
  })
})

describe('resolveLocale', () => {
  it('follows the browser language under auto', () => {
    stubBrowserLanguage('zh-CN')
    expect(resolveLocale()).toBe('zh')
    stubBrowserLanguage('zh')
    expect(resolveLocale()).toBe('zh')
    stubBrowserLanguage('en-US')
    expect(resolveLocale()).toBe('en')
  })

  it('survives an undefined navigator.language', () => {
    stubBrowserLanguage(undefined)
    expect(resolveLocale()).toBe('en')
  })

  it('a pinned pref beats the browser language', () => {
    writeLocalePref('en')
    stubBrowserLanguage('zh-CN')
    expect(resolveLocale()).toBe('en')
  })
})

describe('t', () => {
  it('returns the English key outside Chinese', () => {
    expect(t('Tasks')).toBe('Tasks')
    expect(t('Not in the dictionary')).toBe('Not in the dictionary')
  })

  it('translates known keys under zh and falls back to the key otherwise', () => {
    writeLocalePref('zh')
    expect(t('Tasks')).toBe('任务')
    expect(t('Not in the dictionary')).toBe('Not in the dictionary')
  })

  it('fills {vars} in both locales', () => {
    writeLocalePref('en')
    expect(t('in {n}m', { n: 12 })).toBe('in 12m')
    writeLocalePref('zh')
    expect(t('in {n}m', { n: 12 })).toBe('12 分钟后')
    expect(t('{label} · {action} column', { label: '成本', action: '折叠' })).toBe('成本 · 折叠列')
  })

  it('switching back to en restores English', () => {
    writeLocalePref('zh')
    expect(t('Tasks')).toBe('任务')
    writeLocalePref('en')
    expect(t('Tasks')).toBe('Tasks')
  })
})

describe('the zh-CN dictionary itself', () => {
  it('never maps a key to itself (a lazy entry would be a no-op)', () => {
    const lazy = Object.entries(zhCN).filter(([key, value]) => key === value)
    expect(lazy).toEqual([])
  })

  it('every {placeholder} in a value also exists in its key', () => {
    // A value naming a hole the key does not carry can never be filled by t().
    const mismatched = Object.entries(zhCN).filter(([key, value]) => {
      const holes = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
      const valueOnly = [...holes(value)].filter((hole) => !holes(key).has(hole))
      return valueOnly.length > 0
    })
    expect(mismatched).toEqual([])
  })

  it('covers the core status and navigation vocabulary', () => {
    for (const key of [
      'running',
      'needs review',
      'queued',
      'done',
      'failed',
      'cancelled',
      'Tasks',
      'Settings',
      'New task',
      'Language',
    ]) {
      expect(zhCN[key], `missing dictionary entry: ${key}`).toBeTypeOf('string')
    }
  })
})

describe('useLocale', () => {
  it('re-reads on a language switch', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const view = renderHook(() => useLocale())
    try {
      expect(view.result.current).toBe('en')
      act(() => {
        writeLocalePref('zh')
      })
      expect(view.result.current).toBe('zh')
    } finally {
      view.unmount()
    }
  })
})
