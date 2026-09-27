import { signal } from '@preact/signals';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/dashboard';
  const [p = '/dashboard', q = ''] = raw.split('?');
  const path = p.startsWith('/') ? p : `/${p}`;
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

export const route = signal<Route>(parse(location.hash));

window.addEventListener('hashchange', () => {
  route.value = parse(location.hash);
  window.scrollTo({ top: 0 });
});

export function navigate(path: string): void {
  if (location.hash !== `#${path}`) location.hash = path;
}
