import { ChevronDown, Info, Plus, Settings2, Signal, Trash2, Upload } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { FINGERPRINTS, PLAIN_PORTS, TLS_PORTS } from '../../../shared/constants';
import type { CleanIpDto, OperatorDto } from '../../../shared/types';
import { ApiError, api } from '../../common/api';
import { confirmDialog, Modal, toast } from '../../common/components/overlay';
import {
  Badge,
  Button,
  cx,
  Field,
  Input,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from '../../common/components/ui';
import { fmtNumber } from '../../common/format';
import { lang, t, tMaybe } from '../../common/i18n';
import { PageHeader } from '../components/page';

const opName = (o: OperatorDto) => (lang.value === 'fa' ? o.nameFa : o.nameEn);

function fail(err: unknown) {
  toast(tMaybe(`err_${err instanceof ApiError ? err.code : ''}`, t('error_generic')), 'bad');
}

function IpRow({
  ip,
  selected,
  onSelect,
  onChanged,
}: {
  ip: CleanIpDto;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onChanged: () => void;
}) {
  const patch = async (body: Partial<CleanIpDto>) => {
    try {
      await api(`clean-ips/${ip.id}`, 'PATCH', body);
      onChanged();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <div class="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
      <input
        type="checkbox"
        class="h-4 w-4 accent-[var(--brand)]"
        checked={selected}
        onChange={(e) => onSelect(e.currentTarget.checked)}
      />
      <button
        type="button"
        title={ip.healthy ? t('ip_mark_unhealthy') : t('ip_mark_healthy')}
        onClick={() => patch({ healthy: !ip.healthy })}
        class={cx(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          ip.healthy ? 'bg-ok shadow-[0_0_0_4px] shadow-ok/15' : 'bg-bad',
        )}
      />
      <div class="min-w-0 flex-1">
        <div class="ltr-num truncate font-mono text-[13px] font-semibold">
          <bdi dir="ltr">
            {ip.address.includes(':') ? `[${ip.address}]` : ip.address}
            {ip.port ? `:${ip.port}` : ''}
          </bdi>
        </div>
        <div class="flex flex-wrap gap-x-3 text-[11.5px] text-muted">
          {ip.label && <span>{ip.label}</span>}
          {!ip.port && <span>{t('ip_port_any')}</span>}
          {ip.latencyMs !== null && <span class="ltr-num">{fmtNumber(ip.latencyMs)} ms</span>}
        </div>
      </div>
      <Switch checked={ip.enabled} onChange={(v) => patch({ enabled: v })} />
    </div>
  );
}

function OperatorCard({
  op,
  onEdit,
  onChanged,
}: {
  op: OperatorDto;
  onEdit: (o: OperatorDto) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ips, setIps] = useState<CleanIpDto[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadIps = () =>
    api<{ items: CleanIpDto[] }>(`operators/${op.code}/ips`)
      .then((r) => {
        setIps(r.items);
        setSel((s) => new Set([...s].filter((id) => r.items.some((i) => i.id === id))));
      })
      .catch(fail);

  useEffect(() => {
    if (open && !ips) loadIps();
  }, [open]);

  const refresh = () => {
    loadIps();
    onChanged();
  };

  async function bulk(action: 'delete' | 'enable' | 'disable' | 'healthy' | 'unhealthy') {
    if (
      action === 'delete' &&
      !(await confirmDialog({ title: t('confirm_title'), body: t('ip_delete_confirm'), danger: true }))
    )
      return;
    try {
      await api('clean-ips/bulk', 'POST', { ids: [...sel], action });
      if (action === 'delete') setSel(new Set());
      refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function addIps() {
    setBusy(true);
    try {
      const r = await api<{ added: number; skipped: number; errors: string[] }>(
        `operators/${op.code}/ips`,
        'POST',
        {
          text,
          replace,
        },
      );
      toast(t('ips_result', { added: r.added, skipped: r.skipped }));
      if (r.errors.length) toast(t('ips_invalid', { list: r.errors.slice(0, 5).join('، ') }), 'info', 6000);
      setAdding(false);
      setText('');
      setReplace(false);
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      class={cx(
        'card animate-pop overflow-hidden',
        open && 'sm:col-span-2 xl:col-span-3',
        !op.enabled && 'opacity-70',
      )}
    >
      <div class="flex items-center gap-3 p-4">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 text-start"
          onClick={() => setOpen(!open)}
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Signal size={19} />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-[15px] font-black">{opName(op)}</span>
              <span class="ltr-num font-mono text-[11.5px] text-muted">{op.code}</span>
            </div>
            <div class="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
              <span class={op.ips.healthy ? 'text-ok' : ''}>
                {op.ips.total
                  ? t('op_ips', { healthy: op.ips.healthy, total: op.ips.total })
                  : t('op_no_ips')}
              </span>
              {op.asns.length > 0 && (
                <span class="ltr-num">
                  AS{op.asns.slice(0, 2).join(', AS')}
                  {op.asns.length > 2 ? '…' : ''}
                </span>
              )}
              {op.config.fragment?.enabled && <Badge tone="info">fragment</Badge>}
            </div>
          </div>
          <ChevronDown
            size={18}
            class={cx('shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
        <Switch
          checked={op.enabled}
          onChange={async (v) => {
            try {
              await api(`operators/${op.code}`, 'PATCH', { enabled: v });
              onChanged();
            } catch (err) {
              fail(err);
            }
          }}
        />
      </div>
      {open && (
        <div class="border-t border-line">
          <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <Button size="sm" variant="soft" icon={<Upload size={15} />} onClick={() => setAdding(true)}>
              {t('ips_add')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Settings2 size={15} />} onClick={() => onEdit(op)}>
              {t('op_edit')}
            </Button>
            {ips && ips.length > 0 && (
              <label class="ms-auto flex items-center gap-2 text-[12.5px] text-muted">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--brand)]"
                  checked={sel.size === ips.length}
                  onChange={(e) =>
                    setSel(e.currentTarget.checked ? new Set(ips.map((i) => i.id)) : new Set())
                  }
                />
                {t('ip_select_all')}
              </label>
            )}
          </div>
          {sel.size > 0 && (
            <div class="flex flex-wrap items-center gap-2 border-b border-line bg-brand/5 px-4 py-2">
              <span class="text-[12.5px] font-bold text-brand">{t('ip_selected', { n: sel.size })}</span>
              <Button size="sm" variant="ghost" onClick={() => bulk('healthy')}>
                {t('ip_mark_healthy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulk('unhealthy')}>
                {t('ip_mark_unhealthy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulk('enable')}>
                {t('enabled')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulk('disable')}>
                {t('disabled')}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => bulk('delete')}>
                {t('delete')}
              </Button>
            </div>
          )}
          {!ips ? (
            <div class="space-y-2 p-4">
              <Skeleton class="h-9 w-full" />
              <Skeleton class="h-9 w-full" />
            </div>
          ) : ips.length === 0 ? (
            <p class="px-4 py-5 text-[13px] text-muted">{t('op_no_ips')}</p>
          ) : (
            <div class="max-h-[420px] overflow-y-auto">
              {ips.map((ip) => (
                <IpRow
                  key={ip.id}
                  ip={ip}
                  selected={sel.has(ip.id)}
                  onSelect={(v) => {
                    const next = new Set(sel);
                    if (v) next.add(ip.id);
                    else next.delete(ip.id);
                    setSel(next);
                  }}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`${t('ips_add_title')} · ${opName(op)}`}
        footer={
          <>
            <Button onClick={() => setAdding(false)}>{t('cancel')}</Button>
            <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={addIps}>
              {t('add')}
            </Button>
          </>
        }
      >
        <div class="space-y-4">
          <p class="text-[12.5px] leading-6 text-muted">{t('ips_add_hint')}</p>
          <Textarea ltr rows={9} value={text} onInput={(e) => setText(e.currentTarget.value)} />
          <Switch checked={replace} onChange={setReplace} label={t('ips_replace')} />
        </div>
      </Modal>
    </div>
  );
}

interface Draft {
  code: string;
  nameFa: string;
  nameEn: string;
  asns: string;
  ports: number[];
  fingerprint: string;
  fragment: { enabled: boolean; packets: string; length: string; interval: string };
}

function draftOf(o?: OperatorDto): Draft {
  return {
    code: o?.code ?? '',
    nameFa: o?.nameFa ?? '',
    nameEn: o?.nameEn ?? '',
    asns: o?.asns.join(', ') ?? '',
    ports: o?.config.ports ?? [],
    fingerprint: o?.config.fingerprint ?? '',
    fragment: {
      enabled: o?.config.fragment?.enabled ?? false,
      packets: o?.config.fragment?.packets ?? 'tlshello',
      length: o?.config.fragment?.length ?? '10-30',
      interval: o?.config.fragment?.interval ?? '10-20',
    },
  };
}

function OperatorForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: OperatorDto | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === 'new';
  const [d, setD] = useState<Draft>(() => draftOf(isNew ? undefined : editing));
  const [busy, setBusy] = useState(false);
  const asns = d.asns
    .split(/[\s,،]+/)
    .map((s) => Number(s.replace(/^AS/i, '')))
    .filter((n) => Number.isInteger(n) && n > 0);

  async function save() {
    setBusy(true);
    const body = {
      nameFa: d.nameFa.trim(),
      nameEn: d.nameEn.trim(),
      asns,
      config: {
        ports: d.ports,
        fingerprint: d.fingerprint,
        fragment: d.fragment.enabled ? d.fragment : { enabled: false },
      },
    };
    try {
      if (isNew) await api('operators', 'POST', { ...body, code: d.code.trim().toLowerCase() });
      else await api(`operators/${editing.code}`, 'PATCH', body);
      toast(t('saved'));
      onSaved();
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew) return;
    if (!(await confirmDialog({ title: t('confirm_title'), body: t('op_delete_confirm'), danger: true })))
      return;
    try {
      await api(`operators/${editing.code}`, 'DELETE');
      onSaved();
      onClose();
    } catch (err) {
      fail(err);
    }
  }

  const ports = [...TLS_PORTS, ...PLAIN_PORTS];
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('op_add') : `${t('op_edit')} · ${opName(editing)}`}
      wide
      footer={
        <>
          {!isNew && editing.code !== 'all' && (
            <Button variant="danger" icon={<Trash2 size={15} />} class="me-auto" onClick={remove}>
              {t('delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={
              !d.nameFa.trim() || !d.nameEn.trim() || (isNew && !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(d.code))
            }
            onClick={save}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div class="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <Field label={t('op_code')} hint={t('op_code_hint')} class="sm:col-span-2">
            <Input
              ltr
              value={d.code}
              onInput={(e) => setD({ ...d, code: e.currentTarget.value.toLowerCase() })}
            />
          </Field>
        )}
        <Field label={t('op_name_fa')}>
          <Input value={d.nameFa} onInput={(e) => setD({ ...d, nameFa: e.currentTarget.value })} />
        </Field>
        <Field label={t('op_name_en')}>
          <Input ltr value={d.nameEn} onInput={(e) => setD({ ...d, nameEn: e.currentTarget.value })} />
        </Field>
        <Field label={t('op_asns')} hint={t('op_asns_hint')} class="sm:col-span-2">
          <Input
            ltr
            value={d.asns}
            placeholder="44244, 197207"
            onInput={(e) => setD({ ...d, asns: e.currentTarget.value })}
          />
        </Field>
        <Field label={t('op_ports')} hint={t('op_ports_hint')} class="sm:col-span-2">
          <div class="flex flex-wrap gap-1.5">
            {ports.map((p) => {
              const on = d.ports.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setD({ ...d, ports: on ? d.ports.filter((x) => x !== p) : [...d.ports, p] })}
                  class={cx(
                    'ltr-num rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold',
                    on ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label={t('op_fingerprint')}>
          <Select value={d.fingerprint} onChange={(e) => setD({ ...d, fingerprint: e.currentTarget.value })}>
            <option value="">{t('op_fp_default')}</option>
            {FINGERPRINTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <div class="sm:col-span-2">
          <Switch
            checked={d.fragment.enabled}
            onChange={(v) => setD({ ...d, fragment: { ...d.fragment, enabled: v } })}
            label={t('op_fragment')}
            description={t('op_fragment_hint')}
          />
          {d.fragment.enabled && (
            <div class="mt-2 grid grid-cols-3 gap-3">
              <Field label={t('fragment_packets')}>
                <Input
                  ltr
                  value={d.fragment.packets}
                  onInput={(e) => setD({ ...d, fragment: { ...d.fragment, packets: e.currentTarget.value } })}
                />
              </Field>
              <Field label={t('fragment_length')}>
                <Input
                  ltr
                  value={d.fragment.length}
                  onInput={(e) => setD({ ...d, fragment: { ...d.fragment, length: e.currentTarget.value } })}
                />
              </Field>
              <Field label={t('fragment_interval')}>
                <Input
                  ltr
                  value={d.fragment.interval}
                  onInput={(e) =>
                    setD({ ...d, fragment: { ...d.fragment, interval: e.currentTarget.value } })
                  }
                />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function OperatorsPage() {
  const [items, setItems] = useState<OperatorDto[] | null>(null);
  const [editing, setEditing] = useState<OperatorDto | 'new' | null>(null);

  const load = () =>
    api<{ items: OperatorDto[] }>('operators')
      .then((r) => setItems(r.items))
      .catch(fail);
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        title={t('ops_title')}
        subtitle={t('ops_subtitle')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            {t('op_add')}
          </Button>
        }
      />
      <div class="mb-4 flex gap-3 rounded-2xl border border-info/25 bg-info/8 p-4 text-[13px] leading-6 text-fg-2">
        <Info size={18} class="mt-0.5 shrink-0 text-info" />
        <p>{t('ops_info')}</p>
      </div>
      {!items ? (
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} class="h-20 w-full rounded-xl2" />
          ))}
        </div>
      ) : (
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <OperatorCard key={o.code} op={o} onEdit={setEditing} onChanged={load} />
          ))}
        </div>
      )}
      {editing && <OperatorForm editing={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}
