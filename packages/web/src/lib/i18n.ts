import { useSyncExternalStore } from 'react'

import { zhCN } from '@/lib/i18n.zh-cn'

/** Minimal i18n for the cockpit: `t()` wraps an English source string and looks it up in the
 *  zh-CN dictionary when the locale is Chinese, returning the string itself otherwise. The
 *  English source doubles as the key, so an untranslated string degrades to today's UI.
 *  Per browser like the theme (no server round trip); 'auto' follows navigator.language. */
export const LOCALE_STORAGE_KEY = 'cez-lang'
const CHANGE_EVENT = 'cez-lang-change'

export type LocalePref = 'auto' | 'zh' | 'en'
export type Locale = 'zh' | 'en'

export function readLocalePref(): LocalePref {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored === 'zh' || stored === 'en' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeLocalePref(pref: LocalePref): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, pref)
  } catch {
    // Private mode / storage full: the choice still applies to this page through the event.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function browserPrefersZh(): boolean {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
}

// Cache keyed on the stored pref so t() costs one localStorage read per render pass at most.
let cachedPref: string | null = null
let cachedLocale: Locale = 'en'

export function resolveLocale(): Locale {
  const pref = readLocalePref()
  if (pref !== cachedPref) {
    cachedPref = pref
    cachedLocale = pref === 'zh' ? 'zh' : pref === 'en' ? 'en' : browserPrefersZh() ? 'zh' : 'en'
  }
  return cachedLocale
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Subscribe where a component renders t() output, so a language switch re-renders it live. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, resolveLocale, () => 'en')
}

/** Translate an English source string. `vars` fills `{name}` holes in both the translated
 *  template and the English fallback, which is what interpolated strings go through. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let out = resolveLocale() === 'zh' ? (zhCN[en] ?? en) : en
  if (vars) {
    for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(value))
  }
  return out
}
