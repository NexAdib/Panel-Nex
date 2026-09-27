import { fill, type Lang, lang } from './lang';
import { en } from './locales/en';
import { fa } from './locales/fa';

export { applyLang, isRtl, type Lang, lang, locale, setLang } from './lang';

export type TKey = keyof typeof en;

const dicts: Record<Lang, Record<string, string>> = { fa, en };

/** Translate a key; `{var}` placeholders are replaced from `vars`. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  return fill(dicts[lang.value][key] ?? en[key] ?? key, vars);
}

/** Translate a dynamic key that may be missing (e.g. server error codes). */
export function tMaybe(key: string, fallback: string): string {
  return dicts[lang.value][key] ?? fallback;
}
