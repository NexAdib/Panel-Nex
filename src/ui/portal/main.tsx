import '../styles/app.css';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  Download,
  Globe2,
  Languages,
  Link2,
  ListTree,
  MessageCircle,
  Moon,
  Plus,
  QrCode as QrIcon,
  RefreshCw,
  Signal,
  Smartphone,
  Sun,
} from 'lucide-preact';
import { type ComponentChildren, render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { appsFor, detectPlatform, PLATFORMS, type Platform, subUrlFor } from '../../shared/apps';
import type { PortalData } from '../../shared/types';
import { LogoMark } from '../common/components/logo';
import { Modal, Toasts, toast } from '../common/components/overlay';
import { CopyButton, QrCode } from '../common/components/qr';
import {
  Badge,
  Button,
  Card,
  cx,
  IconButton,
  Ring,
  Select,
  Skeleton,
  Spinner,
} from '../common/components/ui';
import { daysLeft, fmtBytes, fmtDate, fmtNumber } from '../common/format';
import { applyLang, lang, setLang } from '../common/lang';
import { applyTheme, theme, toggleTheme } from '../common/theme';
import { pt } from './strings';

applyTheme();
applyLang();

const base = location.pathname.replace(/\/+$/, '');

function hasSavedLang(): boolean {
  try {
    return !!localStorage.getItem('nx_lang');
  } catch {
    return false;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'x-nexadib': '1', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'brand';
const STATUS_TONE: Record<PortalData['user']['status'], Tone> = {
  active: 'ok',
  on_hold: 'info',
  disabled: 'bad',
  expired: 'bad',
  limited: 'warn',
};

function Header({ brand }: { brand?: string }) {
  return (
    <header class="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <LogoMark size={32} />
          <span class="truncate text-[16px] font-black tracking-tight">{brand ?? '…'}</span>
        </div>
        <div class="flex items-center gap-1">
          <IconButton label={pt('language')} onClick={() => setLang(lang.value === 'fa' ? 'en' : 'fa')}>
            <Languages size={18} />
          </IconButton>
          <IconButton label={pt('theme')} onClick={toggleTheme}>
            {theme.value === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function StatusCard({ d }: { d: PortalData }) {
  const u = d.user;
  const limited = u.dataLimit > 0;
  const pct = limited ? (u.used / u.dataLimit) * 100 : 0;
  const left = daysLeft(u.expireAt);
  const inactive = u.status === 'disabled' || u.status === 'expired' || u.status === 'limited';
  return (
    <Card class="overflow-hidden" padded={false}>
      <div class="relative p-5">
        <div class="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
        <div class="flex items-center justify-between gap-3">
          <h1 class="truncate text-[19px] font-black" dir="auto">
            {pt('hello', { name: u.name })}
          </h1>
          <Badge tone={STATUS_TONE[u.status]} dot>
            {pt(`status_${u.status}`)}
          </Badge>
        </div>
        <div class="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <Ring value={limited ? 100 - pct : 100} size={148} stroke={12}>
            <div>
              <div class="text-[22px] font-black leading-tight">
                {limited ? fmtBytes(Math.max(0, u.dataLimit - u.used)) : '∞'}
              </div>
              <div class="mt-0.5 text-[12px] text-muted">{limited ? pt('remaining') : pt('unlimited')}</div>
            </div>
          </Ring>
          <div class="grid w-full flex-1 grid-cols-2 gap-2.5">
            <Stat label={pt('used')} value={fmtBytes(u.used)} />
            <Stat label={pt('total')} value={limited ? fmtBytes(u.dataLimit) : pt('unlimited')} />
            <Stat
              label={u.status === 'on_hold' ? pt('status_on_hold') : pt('time')}
              value={
                u.status === 'on_hold'
                  ? pt('starts_first_use', { n: u.durationDays ?? 0 })
                  : left === null
                    ? pt('no_expiry')
                    : pt('days_left', { n: left })
              }
              sub={u.expireAt ? pt('expires_on', { date: fmtDate(u.expireAt) }) : undefined}
              wide
            />
            <Stat label={pt('upload')} value={fmtBytes(u.up)} icon={<ArrowUp size={13} />} />
            <Stat label={pt('download')} value={fmtBytes(u.down)} icon={<ArrowDown size={13} />} />
          </div>
        </div>
        {u.resetStrategy !== 'none' && (
          <p class="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted">
            <RefreshCw size={13} />
            {pt('resets', { period: pt(`reset_${u.resetStrategy}`) })}
          </p>
        )}
      </div>
      {inactive && (
        <div class="flex gap-3 border-t border-bad/25 bg-bad/8 px-5 py-4 text-[13px] leading-6">
          <CircleAlert size={18} class="mt-0.5 shrink-0 text-bad" />
          <div>
            <div class="font-bold text-bad">{pt('inactive_title')}</div>
            <div class="text-fg-2">{pt('inactive_body')}</div>
          </div>
        </div>
      )}
      {u.status === 'on_hold' && (
        <div class="border-t border-info/25 bg-info/8 px-5 py-3 text-[13px] text-fg-2">
          {pt('on_hold_body')}
        </div>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ComponentChildren;
  wide?: boolean;
}) {
  return (
    <div class={cx('rounded-xl border border-line bg-surface-2 px-3 py-2.5', wide && 'col-span-2')}>
      <div class="flex items-center gap-1 text-[11.5px] font-semibold text-muted">
        {icon}
        {label}
      </div>
      <div class="mt-0.5 text-[14.5px] font-bold">{value}</div>
      {sub && <div class="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

function AppsCard({ d }: { d: PortalData }) {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform(navigator.userAgent));
  const apps = appsFor(platform);
  const profileName = `${d.brand} - ${d.user.name}`;
  return (
    <Card
      title={
        <span class="flex items-center gap-2">
          <Smartphone size={18} class="text-brand" />
          {pt('add_to_app')}
        </span>
      }
    >
      <p class="-mt-1 mb-4 text-[12.5px] text-muted">{pt('add_to_app_hint')}</p>
      <div class="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            class={cx(
              'shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-bold transition-colors',
              p === platform ? 'grad-brand text-brand-fg' : 'bg-surface-2 text-fg-2 hover:text-fg',
            )}
          >
            {pt(`platform_${p}`)}
          </button>
        ))}
      </div>
      <div class="space-y-2">
        {apps.map((a) => {
          const url = subUrlFor(d.subUrl, a.format);
          const recommended = a.recommended?.includes(platform);
          return (
            <div
              key={a.id}
              class={cx(
                'flex items-center gap-3 rounded-xl border px-3.5 py-3',
                recommended ? 'border-brand/35 bg-brand/5' : 'border-line bg-surface-2',
              )}
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate font-bold" dir="ltr">
                    {a.name}
                  </span>
                  {recommended && <Badge tone="brand">{pt('recommended')}</Badge>}
                </div>
              </div>
              {a.download[platform] && (
                <a
                  href={a.download[platform]}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-fg-2 hover:bg-surface hover:text-fg"
                >
                  <Download size={14} />
                  <span class="hidden sm:inline">{pt('get_app')}</span>
                </a>
              )}
              {a.deeplink ? (
                <a
                  href={a.deeplink(url, profileName)}
                  class="grad-brand inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold text-brand-fg"
                >
                  <Plus size={14} />
                  {pt('add')}
                </a>
              ) : (
                <CopyButton text={url} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

type Fmt = 'auto' | 'b64' | 'clash' | 'singbox' | 'xray';

function SubLinkCard({ d }: { d: PortalData }) {
  const [fmt, setFmt] = useState<Fmt>('auto');
  const [qr, setQr] = useState(false);
  const url = fmt === 'auto' ? d.subUrl : d.formats[fmt];
  const options: Fmt[] = ['auto', 'b64', 'clash', 'singbox', ...(d.fragment ? (['xray'] as Fmt[]) : [])];
  return (
    <Card
      title={
        <span class="flex items-center gap-2">
          <Link2 size={18} class="text-brand" />
          {pt('sub_link')}
        </span>
      }
    >
      <p class="-mt-1 mb-3 text-[12.5px] text-muted">{pt('sub_link_hint')}</p>
      <div class="mb-3 flex flex-wrap gap-1.5">
        {options.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFmt(f)}
            class={cx(
              'rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors',
              f === fmt ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-fg',
            )}
          >
            {pt(`format_${f}`)}
          </button>
        ))}
      </div>
      <div
        class="ltr-num break-all rounded-xl border border-line bg-surface-2 px-3.5 py-3 font-mono text-[12.5px] leading-5 text-fg-2"
        dir="ltr"
      >
        {url}
      </div>
      <div class="mt-3 flex gap-2">
        <CopyButton text={url} size="md" variant="primary" />
        <Button icon={<QrIcon size={16} />} onClick={() => setQr(true)}>
          {pt('qr')}
        </Button>
      </div>
      <Modal open={qr} onClose={() => setQr(false)} title={pt('qr')}>
        <div class="flex flex-col items-center gap-3">
          <QrCode value={url} size={260} />
          <div class="text-[12px] text-muted">{pt(`format_${fmt}`)}</div>
        </div>
      </Modal>
    </Card>
  );
}

function OperatorCard({ d, onChange }: { d: PortalData; onChange: (d: PortalData) => void }) {
  const [busy, setBusy] = useState(false);
  const name = (code: string | null) => {
    const o = d.operator.list.find((x) => x.code === code);
    return o ? (lang.value === 'fa' ? o.fa : o.en) : '';
  };
  const value = d.operator.saved ?? 'auto';
  const detected = d.operator.detected ? name(d.operator.detected) : '';

  async function pick(op: string) {
    setBusy(true);
    try {
      const next = await call<PortalData>('/op', {
        method: 'POST',
        body: JSON.stringify({ op: op === 'auto' ? null : op }),
      });
      onChange(next);
      toast(pt('saved_op'));
    } catch {
      toast(pt('error'), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <span class="flex items-center gap-2">
          <Signal size={18} class="text-brand" />
          {pt('operator')}
        </span>
      }
      actions={busy ? <Spinner size={16} /> : undefined}
    >
      <Select value={value} disabled={busy} onChange={(e) => pick(e.currentTarget.value)}>
        <option value="auto">
          {detected ? pt('operator_auto_detected', { name: detected }) : pt('operator_auto')}
        </option>
        {d.operator.list
          .filter((o) => o.code !== 'all')
          .map((o) => (
            <option key={o.code} value={o.code}>
              {lang.value === 'fa' ? o.fa : o.en}
            </option>
          ))}
      </Select>
      <p class="mt-2.5 text-[12.5px] leading-6 text-muted">{pt('operator_hint')}</p>
    </Card>
  );
}

function CountriesCard({ d }: { d: PortalData }) {
  if (!d.countries.length) return null;
  return (
    <Card
      title={
        <span class="flex items-center gap-2">
          <Globe2 size={18} class="text-brand" />
          {pt('countries')}
        </span>
      }
    >
      <div class="flex flex-wrap gap-2">
        {d.countries.map((c) => (
          <span
            key={c.code}
            class="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] font-semibold"
          >
            <span class="text-lg leading-none">{c.flag}</span>
            {lang.value === 'fa' ? c.fa : c.en}
          </span>
        ))}
      </div>
      <p class="mt-3 text-[12.5px] leading-6 text-muted">{pt('countries_hint')}</p>
    </Card>
  );
}

function ConfigsCard({ d }: { d: PortalData }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  if (!d.configs.length) return null;
  return (
    <Card padded={false}>
      <button
        type="button"
        class="flex w-full items-center gap-3 px-5 py-4 text-start"
        onClick={() => setOpen(!open)}
      >
        <ListTree size={18} class="text-brand" />
        <div class="min-w-0 flex-1">
          <div class="text-[15px] font-bold">
            {pt('configs')} <span class="text-muted">({fmtNumber(d.configs.length)})</span>
          </div>
          <div class="text-[12px] text-muted">{pt('configs_hint')}</div>
        </div>
        <ChevronDown size={18} class={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div class="border-t border-line">
          {d.configs.map((c) => (
            <div key={c.uri} class="flex items-center gap-2 border-b border-line px-4 py-2.5 last:border-0">
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px] font-semibold">{c.name}</div>
                <div class="text-[11px] uppercase text-muted" dir="ltr">
                  {c.proto}
                </div>
              </div>
              <IconButton label={pt('qr')} onClick={() => setQr(c.uri)}>
                <QrIcon size={16} />
              </IconButton>
              <CopyButton text={c.uri} variant="ghost" />
            </div>
          ))}
        </div>
      )}
      <Modal open={!!qr} onClose={() => setQr(null)} title={pt('qr')}>
        <div class="flex justify-center">{qr && <QrCode value={qr} size={260} />}</div>
      </Modal>
    </Card>
  );
}

function Portal() {
  void lang.value;
  void theme.value;
  const [data, setData] = useState<PortalData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    call<PortalData>(`/info${location.search}`)
      .then((d) => {
        if (!hasSavedLang()) setLang(d.lang, false); // the panel's default until the visitor picks one
        setData(d);
        document.title = `${d.brand} · ${d.user.name}`;
      })
      .catch(() => setFailed(true));
  };

  useEffect(load, []);

  const support = useMemo(() => {
    const u = data?.supportUrl ?? '';
    return /^https?:\/\//i.test(u) ? u : '';
  }, [data?.supportUrl]);

  return (
    <div class="min-h-dvh pb-10">
      <Header brand={data?.brand} />
      <main class="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        {failed ? (
          <Card>
            <div class="flex flex-col items-center gap-4 py-6 text-center">
              <CircleAlert size={30} class="text-bad" />
              <p class="max-w-sm text-[13.5px] text-fg-2">{pt('load_failed')}</p>
              <Button icon={<RefreshCw size={16} />} onClick={load}>
                {pt('retry')}
              </Button>
            </div>
          </Card>
        ) : !data ? (
          <>
            <Skeleton class="h-72 w-full rounded-xl2" />
            <Skeleton class="h-56 w-full rounded-xl2" />
            <Skeleton class="h-40 w-full rounded-xl2" />
          </>
        ) : (
          <>
            {data.announcement && (
              <div class="flex gap-3 rounded-2xl border border-brand/30 bg-brand/8 p-4 text-[13.5px] leading-7 whitespace-pre-line">
                <MessageCircle size={18} class="mt-1 shrink-0 text-brand" />
                <p dir="auto" class="min-w-0 flex-1">
                  {data.announcement}
                </p>
              </div>
            )}
            <StatusCard d={data} />
            <AppsCard d={data} />
            <SubLinkCard d={data} />
            {data.operator.list.length > 1 && <OperatorCard d={data} onChange={setData} />}
            <CountriesCard d={data} />
            <ConfigsCard d={data} />
            {support && (
              <a
                href={support}
                target="_blank"
                rel="noopener noreferrer"
                class="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[14px] font-bold hover:border-brand hover:text-brand"
              >
                <MessageCircle size={18} />
                {pt('support')}
              </a>
            )}
          </>
        )}
        <div class="pt-2 text-center text-[11.5px] text-muted" dir="ltr">
          NexAdib
        </div>
      </main>
      <Toasts />
    </div>
  );
}

render(<Portal />, document.getElementById('app')!);
