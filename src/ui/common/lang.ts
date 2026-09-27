// Language state shared by the panel and the subscriber portal. The panel's
// dictionaries live in i18n.ts so the portal bundle does not have to load them.
import { computed, signal } from '@preact/signals';

export type Lang = 'fa' | 'en';

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

export function setLang(l: Lang, persist = true): void {
  lang.value = l;
  if (persist) {
    try {
      localStorage.setItem('nx_lang', l);
    } catch {}
  }
  applyLang();
}

export function fmtNum(v: string | number): string {
  return typeof v === 'number' ? new Intl.NumberFormat(locale.value).format(v) : v;
}

/** Fills `{var}` placeholders. */
export function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, fmtNum(v));
  return out;
}

const CORE = {
  en: { close: 'Close', cancel: 'Cancel', confirm: 'Confirm', copy: 'Copy', copied: 'Copied' },
  fa: { close: 'بستن', cancel: 'انصراف', confirm: 'تأیید', copy: 'کپی', copied: 'کپی شد' },
} as const;

/** Strings used by the shared components (dialogs, copy buttons). */
export function ct(key: keyof (typeof CORE)['en']): string {
  return CORE[lang.value][key];
}
