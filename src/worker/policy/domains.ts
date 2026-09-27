/** Suffix matcher for domain lists: "openai.com" matches "chat.openai.com". */
export class DomainSet {
  private readonly set: Set<string>;
  constructor(domains: readonly string[]) {
    this.set = new Set(
      domains.map((d) => d.trim().toLowerCase().replace(/^\*\./, '').replace(/^\./, '')).filter(Boolean),
    );
  }

  has(domain: string): boolean {
    let d = domain.toLowerCase();
    for (;;) {
      if (this.set.has(d)) return true;
      const i = d.indexOf('.');
      if (i < 0) return false;
      d = d.slice(i + 1);
    }
  }

  get size(): number {
    return this.set.size;
  }
}

const memo = new WeakMap<readonly string[], DomainSet>();

/** DomainSet cached per settings array instance (settings objects are replaced on change). */
export function domainSet(list: readonly string[]): DomainSet {
  let s = memo.get(list);
  if (!s) {
    s = new DomainSet(list);
    memo.set(list, s);
  }
  return s;
}
