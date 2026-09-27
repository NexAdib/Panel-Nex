import type { ComponentChildren } from 'preact';
import { Logo } from '../../common/components/logo';
import { PrefToggles } from './prefs';

/** Centered card layout for install and login screens. */
export function AuthShell({ children }: { children: ComponentChildren }) {
  return (
    <div class="aurora relative flex min-h-dvh flex-col">
      <header class="flex items-center justify-between px-5 py-4">
        <Logo />
        <PrefToggles />
      </header>
      <main class="flex flex-1 items-center justify-center px-4 pb-16">
        <div class="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
