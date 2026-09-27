import {
  Activity,
  Bot,
  ChevronDown,
  Globe,
  Info,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { flagEmoji } from '../../../shared/constants';
import { api } from '../../common/api';
import { confirmDialog, Modal, toast } from '../../common/components/overlay';
import {
  Badge,
  Button,
  Card,
  cx,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from '../../common/components/ui';
import { fmtNumber, fmtRelative } from '../../common/format';
import { t } from '../../common/i18n';
import { PageHeader } from '../components/page';
import { useSettings } from '../hooks';
import { countryName } from './users/pickers';

interface ExitDto {
  id: number;
  country: string;
  type: 'proxyip' | 'socks5' | 'http';
  address: string;
  port: number;
  username: string | null;
  hasPassword: boolean;
  label: string;
  enabled: boolean;
  healthy: boolean;
  failStreak: number;
  egressIp: string | null;
  egressCountry: string | null;
  latencyMs: number | null;
  scope: 'cf' | 'all' | null;
  checkedAt: number | null;
  lastError: string | null;
}

const TYPE_LABEL: Record<ExitDto['type'], string> = { proxyip: 'ProxyIP', socks5: 'SOCKS5', http: 'HTTP' };
const COMMON = [
  'TR',
  'DE',
  'FI',
  'IT',
  'FR',
  'US',
  'BG',
  'NL',
  'GB',
  'SE',
  'PL',
  'AT',
  'CH',
  'AE',
  'CA',
  'SG',
  'JP',
];

function StatusDot({ e }: { e: ExitDto }) {
  const tone = !e.checkedAt ? 'bg-muted' : e.healthy ? 'bg-ok' : 'bg-bad';
  return (
    <span
      class={cx(
        'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
        tone,
        e.healthy && 'shadow-[0_0_0_4px] shadow-ok/15',
      )}
    />
  );
}

function ExitRowView({ e, onChanged }: { e: ExitDto; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const mismatch = e.egressCountry && e.country !== 'ZZ' && e.egressCountry !== e.country;
  return (
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0">
      <StatusDot e={e} />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="ltr-num font-mono text-[13px] font-semibold">
            {e.address}
            {e.port ? `:${e.port}` : ''}
          </span>
          <Badge tone="muted">{TYPE_LABEL[e.type]}</Badge>
          {e.scope && (
            <Badge tone={e.scope === 'all' ? 'ok' : 'info'}>
              {t(e.scope === 'all' ? 'exit_scope_all' : 'exit_scope_cf')}
            </Badge>
          )}
          {e.label && <span class="text-[12px] text-muted">{e.label}</span>}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
          {e.egressIp ? (
            <span>
              {t('exit_egress')}: <span class="ltr-num font-mono text-fg-2">{e.egressIp}</span>{' '}
              {e.egressCountry && flagEmoji(e.egressCountry)}
            </span>
          ) : (
            <span>{e.checkedAt ? (e.lastError ?? t('exit_unhealthy')) : t('exit_unchecked')}</span>
          )}
          {e.latencyMs !== null && <span class="ltr-num">{fmtNumber(e.latencyMs)} ms</span>}
          {e.checkedAt && <span>{fmtRelative(e.checkedAt)}</span>}
          {mismatch && <span class="text-warn">⚠ {t('exit_mismatch')}</span>}
        </div>
      </div>
      <div class="flex items-center gap-1">
        <Switch
          checked={e.enabled}
          onChange={async (v) => {
            await api(`exits/${e.id}`, 'PATCH', { enabled: v });
            onChanged();
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          loading={busy}
          icon={<Activity size={15} />}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`exits/${e.id}/test`, 'POST');
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('exit_test')}
        </Button>
        <IconButton
          label={t('delete')}
          onClick={async () => {
            if (
              !(await confirmDialog({
                title: t('confirm_title'),
                body: t('exit_delete_confirm'),
                danger: true,
              }))
            )
              return;
            await api(`exits/${e.id}`, 'DELETE');
            onChanged();
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function CountryCard({
  code,
  exits,
  isAi,
  onChanged,
  onAdd,
}: {
  code: string;
  exits: ExitDto[];
  isAi: boolean;
  onChanged: () => void;
  onAdd: (country: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const healthy = exits.filter((e) => e.healthy && e.enabled);
  const best = healthy.reduce<number | null>(
    (m, e) => (e.latencyMs !== null && (m === null || e.latencyMs < m) ? e.latencyMs : m),
    null,
  );
  const ips = [...new Set(healthy.map((e) => e.egressIp).filter(Boolean))].slice(0, 3);
  return (
    <div class={cx('card animate-pop overflow-hidden', open && 'sm:col-span-2 xl:col-span-3')}>
      <button
        type="button"
        class="flex w-full items-center gap-3 p-4 text-start"
        onClick={() => setOpen(!open)}
      >
        <span class="text-3xl leading-none">{code === 'ZZ' ? '🛰️' : flagEmoji(code)}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-[15px] font-black">
            {code === 'ZZ' ? t('exits_unclassified') : countryName(code)}
            {isAi && (
              <Badge tone="brand">
                <Bot size={12} /> AI
              </Badge>
            )}
          </div>
          <div class="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
            <span class={healthy.length ? 'text-ok' : 'text-bad'}>
              {t('exit_healthy_of', { a: healthy.length, b: exits.length })}
            </span>
            {best !== null && <span class="ltr-num">{fmtNumber(best)} ms</span>}
            {ips.length > 0 && <span class="ltr-num font-mono">{ips.join(' · ')}</span>}
          </div>
        </div>
        <ChevronDown size={18} class={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div class="border-t border-line">
          {exits.length === 0 ? (
            <p class="px-4 py-4 text-[13px] text-muted">{t('exit_none')}</p>
          ) : (
            exits.map((e) => <ExitRowView key={e.id} e={e} onChanged={onChanged} />)
          )}
          {code !== 'ZZ' && (
            <div class="border-t border-line px-4 py-3">
              <Button size="sm" variant="soft" icon={<Plus size={15} />} onClick={() => onAdd(code)}>
                {t('exit_add')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Draft {
  country: string;
  type: ExitDto['type'];
  address: string;
  port: number;
  username: string;
  password: string;
  label: string;
}

export function ExitsPage() {
  const [items, setItems] = useState<ExitDto[] | null>(null);
  const exitsSettings = useSettings('exits');
  const proxySettings = useSettings('proxy');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importCountry, setImportCountry] = useState('auto');
  const [busy, setBusy] = useState<string | null>(null);
  const [newCountry, setNewCountry] = useState('');
  const [aiText, setAiText] = useState('');

  const load = () =>
    api<{ items: ExitDto[] }>('exits')
      .then((r) => setItems(r.items))
      .catch(() => toast(t('error_generic'), 'bad'));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (exitsSettings.value) setAiText(exitsSettings.value.aiDomains.join('\n'));
  }, [exitsSettings.value?.aiDomains]);

  const s = exitsSettings.value;
  const countries = s
    ? [...new Set([...s.countries, ...(items ?? []).map((e) => e.country).filter((c) => c !== 'ZZ')])]
    : [];
  const unclassified = (items ?? []).filter((e) => e.country === 'ZZ');

  async function saveDraft() {
    if (!draft) return;
    setBusy('add');
    try {
      await api('exits', 'POST', {
        ...draft,
        username: draft.username || null,
        password: draft.password || null,
      });
      setDraft(null);
      load();
    } catch {
      toast(t('error_generic'), 'bad');
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    setBusy('import');
    try {
      const r = await api<{ added: number; skipped: number; invalid: string[]; items: ExitDto[] }>(
        'exits-import',
        'POST',
        {
          text: importText,
          country: importCountry,
        },
      );
      setItems(r.items);
      toast(t('import_result', { added: r.added, skipped: r.skipped, invalid: r.invalid.length }));
      setImportOpen(false);
      setImportText('');
    } catch {
      toast(t('error_generic'), 'bad');
    } finally {
      setBusy(null);
    }
  }

  async function checkAll() {
    setBusy('check');
    try {
      const r = await api<{ checked: number }>('exits-check', 'POST');
      toast(t('exit_checked_n', { n: r.checked }));
      load();
    } finally {
      setBusy(null);
    }
  }

  const newDraft = (country = s?.countries[0] ?? 'DE'): Draft => ({
    country,
    type: 'socks5',
    address: '',
    port: 1080,
    username: '',
    password: '',
    label: '',
  });

  return (
    <>
      <PageHeader
        title={t('exits_title')}
        subtitle={t('exits_subtitle')}
        actions={
          <>
            <Button icon={<RefreshCw size={16} />} loading={busy === 'check'} onClick={checkAll}>
              {t('exit_check_all')}
            </Button>
            <Button icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>
              {t('exit_import')}
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDraft(newDraft())}>
              {t('exit_add')}
            </Button>
          </>
        }
      />

      <div class="mb-4 flex gap-3 rounded-2xl border border-info/25 bg-info/8 p-4 text-[13px] leading-6 text-fg-2">
        <Info size={18} class="mt-0.5 shrink-0 text-info" />
        <p>{t('exits_info')}</p>
      </div>

      {!items || !s ? (
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} class="h-20 w-full rounded-xl2" />
          ))}
        </div>
      ) : (
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {countries.map((c) => (
            <CountryCard
              key={c}
              code={c}
              exits={items.filter((e) => e.country === c)}
              isAi={s.aiEnabled && s.aiCountry === c}
              onChanged={load}
              onAdd={(country) => setDraft(newDraft(country))}
            />
          ))}
          {unclassified.length > 0 && (
            <CountryCard code="ZZ" exits={unclassified} isAi={false} onChanged={load} onAdd={() => {}} />
          )}
        </div>
      )}

      {s && (
        <div class="mt-6 grid gap-4 lg:grid-cols-2">
          <Card
            title={
              <span class="flex items-center gap-2">
                <Bot size={18} class="text-brand" />
                {t('ai_routing')}
              </span>
            }
            actions={
              <Button
                size="sm"
                variant="primary"
                icon={<Save size={15} />}
                loading={exitsSettings.saving}
                onClick={() =>
                  exitsSettings.save({
                    aiEnabled: s.aiEnabled,
                    aiCountry: s.aiCountry,
                    aiDomains: aiText
                      .split(/\s+/)
                      .map((x) => x.trim().toLowerCase())
                      .filter(Boolean),
                  })
                }
              >
                {t('save')}
              </Button>
            }
          >
            <div class="space-y-4">
              <Switch
                checked={s.aiEnabled}
                onChange={(v) => exitsSettings.setValue({ ...s, aiEnabled: v })}
                label={t('ai_routing')}
                description={t('ai_routing_hint')}
              />
              <Field label={t('ai_country')}>
                <Select
                  value={s.aiCountry}
                  onChange={(e) => exitsSettings.setValue({ ...s, aiCountry: e.currentTarget.value })}
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {flagEmoji(c)} {countryName(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('ai_domains')} hint={t('ai_domains_hint')}>
                <Textarea ltr rows={6} value={aiText} onInput={(e) => setAiText(e.currentTarget.value)} />
              </Field>
            </div>
          </Card>

          <Card
            title={
              <span class="flex items-center gap-2">
                <Globe size={18} class="text-brand" />
                {t('exits_countries')}
              </span>
            }
            actions={
              <Button
                size="sm"
                variant="primary"
                icon={<Save size={15} />}
                loading={exitsSettings.saving || proxySettings.saving}
                onClick={async () => {
                  await exitsSettings.save({ countries: s.countries, forceAllDefault: s.forceAllDefault });
                  if (proxySettings.value) {
                    await proxySettings.save({
                      cfFallbackCountry: proxySettings.value.cfFallbackCountry,
                      nat64Prefixes: proxySettings.value.nat64Prefixes,
                    });
                  }
                }}
              >
                {t('save')}
              </Button>
            }
          >
            <div class="space-y-4">
              <p class="text-[12.5px] text-muted">{t('exits_countries_hint')}</p>
              <div class="flex flex-wrap gap-1.5">
                {s.countries.map((c) => (
                  <span
                    key={c}
                    class="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] font-semibold"
                  >
                    {flagEmoji(c)} {countryName(c)}
                    <button
                      type="button"
                      class="text-muted hover:text-bad"
                      onClick={() =>
                        exitsSettings.setValue({ ...s, countries: s.countries.filter((x) => x !== c) })
                      }
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <div class="flex flex-wrap gap-1.5">
                {COMMON.filter((c) => !s.countries.includes(c)).map((c) => (
                  <button
                    key={c}
                    type="button"
                    class="rounded-lg border border-dashed border-line-2 px-2 py-1 text-[12px] text-muted hover:border-brand hover:text-brand"
                    onClick={() => exitsSettings.setValue({ ...s, countries: [...s.countries, c] })}
                  >
                    + {flagEmoji(c)} {c}
                  </button>
                ))}
              </div>
              <div class="flex gap-2">
                <Input
                  ltr
                  maxLength={2}
                  placeholder={t('add_country')}
                  value={newCountry}
                  onInput={(e) => setNewCountry(e.currentTarget.value.toUpperCase())}
                />
                <Button
                  disabled={!/^[A-Z]{2}$/.test(newCountry) || s.countries.includes(newCountry)}
                  onClick={() => {
                    exitsSettings.setValue({ ...s, countries: [...s.countries, newCountry] });
                    setNewCountry('');
                  }}
                >
                  {t('add')}
                </Button>
              </div>
              <Switch
                checked={s.forceAllDefault}
                onChange={(v) => exitsSettings.setValue({ ...s, forceAllDefault: v })}
                label={t('force_all_default')}
                description={t('f_force_exit_hint')}
              />
              {proxySettings.value && (
                <>
                  <Field label={t('cf_fallback')} hint={t('cf_fallback_hint')}>
                    <Select
                      value={proxySettings.value.cfFallbackCountry}
                      onChange={(e) =>
                        proxySettings.setValue({
                          ...proxySettings.value!,
                          cfFallbackCountry: e.currentTarget.value,
                        })
                      }
                    >
                      <option value="">{t('any_country')}</option>
                      {countries.map((c) => (
                        <option key={c} value={c}>
                          {flagEmoji(c)} {countryName(c)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('nat64_prefixes')} hint={t('nat64_hint')}>
                    <Input
                      ltr
                      value={proxySettings.value.nat64Prefixes.join(', ')}
                      onInput={(e) =>
                        proxySettings.setValue({
                          ...proxySettings.value!,
                          nat64Prefixes: e.currentTarget.value
                            .split(/[\s,]+/)
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={t('exit_add')}
        footer={
          <Button
            variant="primary"
            loading={busy === 'add'}
            disabled={!draft?.address.trim()}
            onClick={saveDraft}
          >
            {t('save')}
          </Button>
        }
      >
        {draft && (
          <div class="space-y-4">
            <Field label={t('exit_type')}>
              <Segmented<ExitDto['type']>
                value={draft.type}
                onChange={(v) =>
                  setDraft({ ...draft, type: v, port: v === 'socks5' ? 1080 : v === 'http' ? 8080 : 0 })
                }
                options={[
                  { value: 'socks5', label: 'SOCKS5' },
                  { value: 'http', label: 'HTTP' },
                  { value: 'proxyip', label: 'ProxyIP' },
                ]}
              />
            </Field>
            <Field label={t('exit_country')}>
              <Select
                value={draft.country}
                onChange={(e) => setDraft({ ...draft, country: e.currentTarget.value })}
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {flagEmoji(c)} {countryName(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <div class="grid grid-cols-3 gap-3">
              <Field label={t('exit_address')} class="col-span-2">
                <Input
                  ltr
                  value={draft.address}
                  onInput={(e) => setDraft({ ...draft, address: e.currentTarget.value })}
                />
              </Field>
              <Field label={t('exit_port')}>
                <Input
                  ltr
                  type="number"
                  min={0}
                  max={65535}
                  value={draft.port}
                  onInput={(e) => setDraft({ ...draft, port: Number(e.currentTarget.value) || 0 })}
                />
              </Field>
            </div>
            {draft.type === 'proxyip' && <p class="text-[12px] text-muted">{t('exit_port_hint')}</p>}
            {draft.type !== 'proxyip' && (
              <div class="grid grid-cols-2 gap-3">
                <Field label={`${t('exit_username')} (${t('optional')})`}>
                  <Input
                    ltr
                    value={draft.username}
                    onInput={(e) => setDraft({ ...draft, username: e.currentTarget.value })}
                  />
                </Field>
                <Field label={`${t('password')} (${t('optional')})`}>
                  <Input
                    ltr
                    type="password"
                    value={draft.password}
                    onInput={(e) => setDraft({ ...draft, password: e.currentTarget.value })}
                  />
                </Field>
              </div>
            )}
            <Field label={`${t('exit_label')} (${t('optional')})`}>
              <Input
                value={draft.label}
                maxLength={60}
                onInput={(e) => setDraft({ ...draft, label: e.currentTarget.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('import_title')}
        wide
        footer={
          <Button
            variant="primary"
            loading={busy === 'import'}
            disabled={!importText.trim()}
            onClick={runImport}
          >
            {t('exit_import')}
          </Button>
        }
      >
        <div class="space-y-4">
          <p class="text-[13px] leading-6 text-muted">{t('import_hint')}</p>
          <Textarea
            ltr
            rows={10}
            placeholder={'1.2.3.4\nrelay.example.com #FRA\nsocks5://user:pass@5.6.7.8:1080'}
            value={importText}
            onInput={(e) => setImportText(e.currentTarget.value)}
          />
          <Field label={t('exit_country')}>
            <Select value={importCountry} onChange={(e) => setImportCountry(e.currentTarget.value)}>
              <option value="auto">🛰️ {t('import_country_auto')}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {flagEmoji(c)} {countryName(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
