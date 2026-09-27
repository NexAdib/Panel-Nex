import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Gauge,
  Globe,
  History,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { flagEmoji, type UserStatus } from '../../../shared/constants';
import type { OverviewDto } from '../../../shared/types';
import { api } from '../../common/api';
import { Donut, type DonutPart, Legend, TrafficBars } from '../../common/components/chart';
import { toast } from '../../common/components/overlay';
import { Badge, Button, Card, cx, Empty, Skeleton, StatCard } from '../../common/components/ui';
import { fmtBytes, fmtNumber, fmtRelative } from '../../common/format';
import { t, tMaybe } from '../../common/i18n';
import { PageHeader } from '../components/page';
import { navigate } from '../router';
import { session } from '../state';
import { STATUS_KEY, STATUS_TONE } from './users/labels';
import { countryName } from './users/pickers';

const STATUS_COLOR: Record<UserStatus, string> = {
  active: 'var(--ok)',
  on_hold: 'var(--info)',
  limited: 'var(--warn)',
  expired: 'var(--bad)',
  disabled: 'var(--muted)',
};

function activityText(r: OverviewDto['recent'][number]): string {
  let name = '';
  try {
    const d = r.details ? (JSON.parse(r.details) as { name?: string; count?: number }) : {};
    name = d.name ?? (d.count ? String(d.count) : '');
  } catch {}
  const label = tMaybe(`act_${r.action}`, r.action.replace(/_/g, ' '));
  return name ? `${label} · ${name}` : label;
}

export function DashboardPage() {
  const [d, setD] = useState<OverviewDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<OverviewDto>('stats/overview')
      .then(setD)
      .catch(() => toast(t('error_generic'), 'bad'));

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    setBusy(true);
    try {
      await api('system/maintenance', 'POST');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const parts: DonutPart[] = d
    ? (['active', 'on_hold', 'limited', 'expired', 'disabled'] as UserStatus[]).map((s) => ({
        key: s,
        value: d.users[s],
        color: STATUS_COLOR[s],
        label: t(STATUS_KEY[s]),
      }))
    : [];
  const maxTop = d?.top[0]?.total ?? 1;

  return (
    <>
      <PageHeader
        title={t('dash_welcome', { name: session.value ?? '' })}
        subtitle={
          d?.maintenanceAt ? t('dash_updated', { when: fmtRelative(d.maintenanceAt) }) : t('dash_subtitle')
        }
        actions={
          <>
            <Button icon={<RefreshCw size={16} />} loading={busy} onClick={refresh}>
              {t('refresh')}
            </Button>
            <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => navigate('/users?new=1')}>
              {t('user_new')}
            </Button>
          </>
        }
      />

      {!d ? (
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} class="h-24 w-full rounded-xl2" />
            ))}
          </div>
          <Skeleton class="h-72 w-full rounded-xl2" />
        </div>
      ) : (
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('dash_users')}
              value={fmtNumber(d.users.all)}
              sub={t('dash_active_n', { n: d.users.active })}
              icon={<Users size={20} />}
            />
            <StatCard
              label={t('dash_online')}
              value={fmtNumber(d.users.online)}
              sub={t('dash_online_hint')}
              icon={<Wifi size={20} />}
              tone="ok"
            />
            <StatCard
              label={t('dash_today')}
              value={fmtBytes(d.today.up + d.today.down)}
              sub={
                <span class="flex gap-2">
                  <span class="inline-flex items-center gap-0.5 whitespace-nowrap">
                    <ArrowDown size={12} />
                    {fmtBytes(d.today.down)}
                  </span>
                  <span class="inline-flex items-center gap-0.5 whitespace-nowrap">
                    <ArrowUp size={12} />
                    {fmtBytes(d.today.up)}
                  </span>
                </span>
              }
              icon={<Activity size={20} />}
              tone="info"
            />
            <StatCard
              label={t('dash_30d')}
              value={fmtBytes(d.last30.up + d.last30.down)}
              sub={t('dash_conns_today', { n: d.today.conns })}
              icon={<TrendingUp size={20} />}
              tone="warn"
            />
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <Card
              class="xl:col-span-2"
              title={
                <span class="flex items-center gap-2">
                  <Activity size={18} class="text-brand" />
                  {t('dash_traffic_30d')}
                </span>
              }
              actions={
                <span class="flex items-center gap-3 text-[12px] text-muted">
                  <span class="flex items-center gap-1.5">
                    <i class="grad-brand inline-block h-2.5 w-2.5 rounded-full" />
                    {t('download')}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <i class="inline-block h-2.5 w-2.5 rounded-full bg-info" />
                    {t('upload')}
                  </span>
                </span>
              }
            >
              <TrafficBars data={d.daily} />
            </Card>

            <Card
              title={
                <span class="flex items-center gap-2">
                  <Gauge size={18} class="text-brand" />
                  {t('dash_status')}
                </span>
              }
            >
              <div class="flex flex-col items-center gap-4 sm:flex-row">
                <Donut
                  size={132}
                  stroke={16}
                  parts={parts}
                  center={
                    <div>
                      <div class="text-2xl font-black">{fmtNumber(d.users.all)}</div>
                      <div class="text-[11.5px] text-muted">{t('dash_users')}</div>
                    </div>
                  }
                />
                <div class="w-full flex-1">
                  <Legend parts={parts} onPick={(k) => navigate(`/users?status=${k}`)} />
                </div>
              </div>
              {(d.users.expiringSoon > 0 || d.users.nearLimit > 0) && (
                <div class="mt-4 space-y-2 border-t border-line pt-4">
                  {d.users.expiringSoon > 0 && (
                    <div class="flex items-center gap-2 text-[13px] text-warn">
                      <CalendarClock size={16} />
                      {t('dash_expiring', { n: d.users.expiringSoon })}
                    </div>
                  )}
                  {d.users.nearLimit > 0 && (
                    <div class="flex items-center gap-2 text-[13px] text-warn">
                      <Gauge size={16} />
                      {t('dash_near_limit', { n: d.users.nearLimit })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card
              title={
                <span class="flex items-center gap-2">
                  <TrendingUp size={18} class="text-brand" />
                  {t('dash_top')}
                </span>
              }
            >
              {d.top.length === 0 ? (
                <Empty title={t('dash_no_traffic')} />
              ) : (
                <div class="space-y-3">
                  {d.top.map((u) => (
                    <div key={u.id}>
                      <div class="mb-1 flex items-center justify-between gap-2 text-[13px]">
                        <span class="flex min-w-0 items-center gap-2">
                          <span class="truncate font-semibold">{u.name}</span>
                          <Badge tone={STATUS_TONE[u.status]}>{t(STATUS_KEY[u.status])}</Badge>
                        </span>
                        <span class="shrink-0 font-bold">{fmtBytes(u.total)}</span>
                      </div>
                      <div class="h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          class="grad-brand h-full rounded-full"
                          style={{ width: `${(u.total / maxTop) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title={
                <span class="flex items-center gap-2">
                  <Globe size={18} class="text-brand" />
                  {t('dash_exits')}
                </span>
              }
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigate('/exits')}>
                  {t('manage')}
                </Button>
              }
            >
              {d.exits.length === 0 ? (
                <Empty title={t('exit_none')} />
              ) : (
                <div class="grid grid-cols-2 gap-2">
                  {d.exits.map((e) => (
                    <div
                      key={e.country}
                      class="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
                    >
                      <span class="text-xl leading-none">{flagEmoji(e.country)}</span>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-[12.5px] font-semibold">{countryName(e.country)}</div>
                        <div class={cx('text-[11.5px]', e.healthy ? 'text-ok' : 'text-bad')}>
                          {t('exit_healthy_of', { a: e.healthy, b: e.total })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title={
                <span class="flex items-center gap-2">
                  <History size={18} class="text-brand" />
                  {t('dash_recent')}
                </span>
              }
            >
              {d.recent.length === 0 ? (
                <Empty title={t('dash_no_activity')} />
              ) : (
                <ul class="space-y-2.5">
                  {d.recent.map((r) => (
                    <li key={r.id} class="flex items-start gap-2.5 text-[13px]">
                      <span
                        class={cx(
                          'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                          r.actor === 'system' ? 'bg-info' : 'bg-brand',
                        )}
                      />
                      <div class="min-w-0 flex-1">
                        <div class="truncate">{activityText(r)}</div>
                        <div class="text-[11.5px] text-muted">
                          {r.actor === 'system'
                            ? t('act_system')
                            : r.actor === 'portal'
                              ? t('act_portal')
                              : r.actor}{' '}
                          · {fmtRelative(r.createdAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
