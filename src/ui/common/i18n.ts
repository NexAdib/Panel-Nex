import { computed, signal } from '@preact/signals';
import { en } from './locales/en';
import { fa } from './locales/fa';

export type Lang = 'fa' | 'en';
export type TKey = keyof typeof en;

const dicts: Record<Lang, Record<string, string>> = { fa, en };

function initial(): Lang {
  try {
    const saved = localStorage.getItem('nx_lang');
    if (saved === 'fa' || saved === 'en') return saved;
  } catch {}
  return 'fa';
}

export const lang = signal<Lang>(initial());
export const isRtl = computed(() => lang.value === 'fa');
export const locale = computed(() => (lang.value === 'fa' ? 'fa-IR' : 'en-US'));

export function applyLang(): void {
  const l = lang.value;
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
}

export function setLang(l: Lang): void {
  lang.value = l;
  try {
    localStorage.setItem('nx_lang', l);
  } catch {}
  applyLang();
}

/** Translate a key; `{var}` placeholders are replaced from `vars`. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s = dicts[lang.value][key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, fmtNum(v));
  }
  return s;
}

/** Translate a dynamic key that may be missing (e.g. server error codes). */
export function tMaybe(key: string, fallback: string): string {
  return dicts[lang.value][key] ?? fallback;
}

function fmtNum(v: string | number): string {
  return typeof v === 'number' ? new Intl.NumberFormat(locale.value).format(v) : v;
}
