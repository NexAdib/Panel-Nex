import { signal } from '@preact/signals';

export type Theme = 'dark' | 'light';

function initial(): Theme {
  try {
    const saved = localStorage.getItem('nx_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const theme = signal<Theme>(initial());

export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', theme.value === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme.value === 'dark' ? '#090b12' : '#f5f6fa');
}

export function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('nx_theme', theme.value);
  } catch {}
  applyTheme();
}
