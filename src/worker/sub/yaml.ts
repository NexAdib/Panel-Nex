// Minimal YAML emitter for the Clash/Mihomo config. Strings are emitted as
// JSON-quoted scalars, which are always valid YAML, so no user-controlled text
// (names, hosts) can break the document structure.

type Yaml = string | number | boolean | null | undefined | Yaml[] | { [k: string]: Yaml };

const PLAIN_KEY = /^[A-Za-z0-9_-]+$/;
const key = (k: string) => (PLAIN_KEY.test(k) ? k : JSON.stringify(k));

function scalar(v: string | number | boolean | null): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

function isInline(v: Yaml): boolean {
  if (Array.isArray(v)) return v.every((x) => x === null || typeof x !== 'object');
  return false;
}

function emit(v: Yaml, indent: number, out: string[]): void {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item).filter(([, x]) => x !== undefined);
        entries.forEach(([k, x], i) => {
          const prefix = i === 0 ? `${pad}- ` : `${pad}  `;
          line(prefix, k, x, indent + 2, out);
        });
      } else if (Array.isArray(item)) {
        out.push(`${pad}- ${inlineList(item)}`);
      } else {
        out.push(`${pad}- ${scalar(item as string | number | boolean | null)}`);
      }
    }
    return;
  }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue;
      line(pad, k, x, indent, out);
    }
  }
}

function inlineList(list: Yaml[]): string {
  return `[${list.map((x) => scalar(x as string | number | boolean | null)).join(', ')}]`;
}

function line(prefix: string, k: string, x: Yaml, indent: number, out: string[]): void {
  if (x !== null && typeof x === 'object') {
    if (isInline(x)) {
      out.push(`${prefix}${key(k)}: ${inlineList(x as Yaml[])}`);
    } else if (Array.isArray(x) && x.length === 0) {
      out.push(`${prefix}${key(k)}: []`);
    } else {
      out.push(`${prefix}${key(k)}:`);
      emit(x, indent + 2, out);
    }
  } else {
    out.push(`${prefix}${key(k)}: ${scalar(x as string | number | boolean | null)}`);
  }
}

export function toYaml(doc: { [k: string]: Yaml }): string {
  const out: string[] = [];
  emit(doc, 0, out);
  return `${out.join('\n')}\n`;
}

export type { Yaml };
