/** Config name from a template like "{flag} {country} | {op} | {port}"; tidies separators left by empty values. */
export function renderName(template: string, vars: Record<string, string>): string {
  let s = template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  s = s.replace(/\s*\|\s*(\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '');
  return s.replace(/\s{2,}/g, ' ').trim();
}
