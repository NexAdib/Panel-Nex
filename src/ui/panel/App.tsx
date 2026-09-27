import type { LucideIcon } from 'lucide-preact';
import {
  Cloud,
  Filter,
  Gamepad2,
  Globe,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Signal,
  Users,
  X,
} from 'lucide-preact';
import type { ComponentType } from 'preact';
import { useState } from 'preact/hooks';
import { api } from '../common/api';
import { Logo } from '../common/components/logo';
import { ConfirmHost, Toasts } from '../common/components/overlay';
import { cx } from '../common/components/ui';
import { type TKey, t } from '../common/i18n';
import { PrefToggles } from './components/prefs';
import { ComingSoon } from './pages/ComingSoon';
import { DashboardPage } from './pages/Dashboard';
import { ExitsPage } from './pages/ExitsPage';
import { PlansPage } from './pages/PlansPage';
import { UsersPage } from './pages/users/UsersPage';
import { navigate, route } from './router';

interface NavItem {
  path: string;
  key: TKey;
  icon: LucideIcon;
  page: ComponentType;
}

const NAV: { group: TKey; items: NavItem[] }[] = [
  {
    group: 'nav_main',
    items: [
      { path: '/dashboard', key: 'nav_dashboard', icon: LayoutDashboard, page: DashboardPage },
      { path: '/users', key: 'nav_users', icon: Users, page: UsersPage },
      { path: '/plans', key: 'nav_plans', icon: Layers, page: PlansPage },
    ],
  },
  {
    group: 'nav_network',
    items: [
      { path: '/exits', key: 'nav_exits', icon: Globe, page: ExitsPage },
      { path: '/operators', key: 'nav_operators', icon: Signal, page: ComingSoon },
      { path: '/subscription', key: 'nav_subscription', icon: Link2, page: ComingSoon },
      { path: '/warp', key: 'nav_warp', icon: Gamepad2, page: ComingSoon },
      { path: '/filter', key: 'nav_filter', icon: Filter, page: ComingSoon },
    ],
  },
  {
    group: 'nav_system',
    items: [
      { path: '/accounts', key: 'nav_accounts', icon: Cloud, page: ComingSoon },
      { path: '/security', key: 'nav_security', icon: ShieldCheck, page: ComingSoon },
      { path: '/logs', key: 'nav_logs', icon: ScrollText, page: ComingSoon },
      { path: '/system', key: 'nav_system_page', icon: Settings, page: ComingSoon },
    ],
  },
];

const ALL = NAV.flatMap((g) => g.items);
const MOBILE_MAIN = ['/dashboard', '/users', '/exits', '/accounts'];

function current(): NavItem {
  const first = `/${route.value.parts[0] ?? 'dashboard'}`;
  return ALL.find((i) => i.path === first) ?? ALL[0]!;
}

function NavLinks({ onPick }: { onPick?: () => void }) {
  const active = current().path;
  return (
    <nav class="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <div class="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted">
            {t(g.group)}
          </div>
          <div class="space-y-0.5">
            {g.items.map((it) => {
              const Icon = it.icon;
              const on = it.path === active;
              return (
                <a
                  key={it.path}
                  href={`#${it.path}`}
                  onClick={onPick}
                  class={cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors',
                    on ? 'bg-brand/12 text-brand' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <Icon size={18} />
                  <span class="truncate">{t(it.key)}</span>
                  {on && <span class="ms-auto h-1.5 w-1.5 rounded-full bg-brand" />}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function App({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [menu, setMenu] = useState(false);
  const item = current();
  const Page = item.page;

  async function logout() {
    try {
      await api('auth/logout', 'POST');
    } catch {}
    onLogout();
  }

  return (
    <div class="min-h-dvh lg:grid lg:grid-cols-[272px_1fr]">
      {/* Sidebar (desktop) */}
      <aside class="sticky top-0 hidden h-dvh flex-col border-e border-line bg-bg-2/60 px-3 py-4 lg:flex">
        <div class="px-2 pb-5">
          <Logo />
        </div>
        <div class="flex-1 overflow-y-auto pe-1">
          <NavLinks />
        </div>
        <div class="mt-4 border-t border-line px-2 pt-3">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-[13px] font-bold">{username}</div>
              <div class="ltr-num text-[11px] text-muted">v{__APP_VERSION__}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-surface-2 hover:text-bad"
            >
              <LogOut size={15} />
              {t('logout')}
            </button>
          </div>
        </div>
      </aside>

      <div class="min-w-0">
        {/* Top bar */}
        <header class="glass sticky top-0 z-30 border-b border-line">
          <div class="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 lg:px-8">
            <div class="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                class="rounded-lg p-2 text-fg-2 hover:bg-surface-2"
                onClick={() => setMenu(true)}
                aria-label={t('nav_more')}
              >
                <Menu size={20} />
              </button>
              <Logo compact />
            </div>
            <div class="hidden text-[13px] font-semibold text-muted lg:block">{t(item.key)}</div>
            <PrefToggles />
          </div>
        </header>

        <main class="mx-auto max-w-[1400px] px-4 pb-28 pt-5 lg:px-8 lg:pb-12">
          <Page />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav class="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div class="grid grid-cols-5">
          {MOBILE_MAIN.map((p) => {
            const it = ALL.find((i) => i.path === p)!;
            const Icon = it.icon;
            const on = item.path === p;
            return (
              <a
                key={p}
                href={`#${p}`}
                class={cx(
                  'flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold',
                  on ? 'text-brand' : 'text-muted',
                )}
              >
                <Icon size={20} />
                <span class="max-w-full truncate px-1">{t(it.key)}</span>
              </a>
            );
          })}
          <button
            type="button"
            onClick={() => setMenu(true)}
            class="flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold text-muted"
          >
            <Menu size={20} />
            {t('nav_more')}
          </button>
        </div>
      </nav>

      {/* Mobile drawer menu */}
      {menu && (
        <div class="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('close')}
            class="absolute inset-0 bg-black/55"
            onClick={() => setMenu(false)}
          />
          <div class="animate-pop absolute inset-y-0 start-0 flex w-[82%] max-w-xs flex-col border-e border-line bg-surface px-3 py-4">
            <div class="mb-4 flex items-center justify-between px-2">
              <Logo />
              <button
                type="button"
                class="rounded-lg p-2 text-muted hover:bg-surface-2"
                onClick={() => setMenu(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto">
              <NavLinks onPick={() => setMenu(false)} />
            </div>
            <button
              type="button"
              onClick={logout}
              class="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-bad hover:bg-bad/10"
            >
              <LogOut size={18} />
              {t('logout')}
            </button>
          </div>
        </div>
      )}

      <Toasts />
      <ConfirmHost />
    </div>
  );
}

export { navigate };
