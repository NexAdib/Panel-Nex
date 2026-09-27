import {
  Globe,
  Link2,
  Palette,
  Save,
  Scissors,
  ShieldBan,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { FINGERPRINTS, flagEmoji, PLAIN_PORTS, TLS_PORTS } from '../../../shared/constants';
import type { SettingsMap } from '../../../shared/settings';
import { renderName } from '../../../shared/template';
import {
  Button,
  Card,
  cx,
  Field,
  Input,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from '../../common/components/ui';
import { lang, t } from '../../common/i18n';
import { PageHeader } from '../components/page';
import { useSettings } from '../hooks';

function Title({ icon, children }: { icon: ComponentChildren; children: ComponentChildren }) {
  return (
    <span class="flex items-center gap-2">
      <span class="text-brand">{icon}</span>
      {children}
    </span>
  );
}

function SaveBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="primary" icon={<Save size={15} />} loading={loading} onClick={onClick}>
      {t('save')}
    </Button>
  );
}

function PortChips({
  all,
  value,
  onChange,
}: {
  all: readonly number[];
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div class="flex flex-wrap gap-1.5">
      {all.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p].sort((a, b) => a - b))}
            class={cx(
              'ltr-num rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold transition-colors',
              on ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-fg',
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

const lines = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

function LinksCard({ g }: { g: ReturnType<typeof useSettings<'general'>> }) {
  const v = g.value!;
  const [domains, setDomains] = useState(v.domains.join('\n'));
  useEffect(() => setDomains(v.domains.join('\n')), [v.domains.join('\n')]);
  const set = (patch: Partial<SettingsMap['general']>) => g.setValue({ ...v, ...patch });
  return (
    <Card
      title={<Title icon={<Link2 size={18} />}>{t('sub_links')}</Title>}
      actions={
        <SaveBtn
          loading={g.saving}
          onClick={() =>
            g.save({
              domains: lines(domains),
              subHost: v.subHost.trim().toLowerCase(),
              subPath: v.subPath,
              wsPath: v.wsPath,
            })
          }
        />
      }
    >
      <div class="space-y-4">
        <Field label={t('sub_domains')} hint={t('sub_domains_hint')}>
          <Textarea
            ltr
            rows={4}
            value={domains}
            placeholder="cdn.example.com"
            onInput={(e) => setDomains(e.currentTarget.value)}
          />
        </Field>
        <Field label={t('sub_host')} hint={t('sub_host_hint')}>
          <Input
            ltr
            value={v.subHost}
            placeholder="sub.example.com"
            onInput={(e) => set({ subHost: e.currentTarget.value })}
          />
        </Field>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('sub_path')}>
            <Input
              ltr
              value={v.subPath}
              onInput={(e) => set({ subPath: e.currentTarget.value.toLowerCase() })}
            />
          </Field>
          <Field label={t('ws_path')}>
            <Input
              ltr
              value={v.wsPath}
              onInput={(e) => set({ wsPath: e.currentTarget.value.toLowerCase() })}
            />
          </Field>
        </div>
        <p class="flex gap-2 text-[12px] leading-5 text-warn">
          <TriangleAlert size={15} class="mt-0.5 shrink-0" />
          {t('path_warning')}
        </p>
      </div>
    </Card>
  );
}

function ProtocolsCard({ p }: { p: ReturnType<typeof useSettings<'proxy'>> }) {
  const v = p.value!;
  const set = (patch: Partial<SettingsMap['proxy']>) => p.setValue({ ...v, ...patch });
  return (
    <Card
      title={<Title icon={<SlidersHorizontal size={18} />}>{t('sub_protocols')}</Title>}
      actions={
        <SaveBtn
          loading={p.saving}
          onClick={() =>
            p.save({
              vless: v.vless,
              trojan: v.trojan,
              tlsPorts: v.tlsPorts,
              plainPorts: v.plainPorts,
              fingerprint: v.fingerprint,
              alpn: v.alpn,
              earlyData: v.earlyData,
            })
          }
        />
      }
    >
      <div class="space-y-4">
        <div class="grid gap-x-6 sm:grid-cols-2">
          <Switch checked={v.vless} onChange={(x) => set({ vless: x })} label={t('proto_vless')} />
          <Switch checked={v.trojan} onChange={(x) => set({ trojan: x })} label={t('proto_trojan')} />
        </div>
        <Field label={t('tls_ports')}>
          <PortChips all={TLS_PORTS} value={v.tlsPorts} onChange={(x) => set({ tlsPorts: x })} />
        </Field>
        <Field label={t('plain_ports')}>
          <PortChips all={PLAIN_PORTS} value={v.plainPorts} onChange={(x) => set({ plainPorts: x })} />
          {v.plainPorts.length > 0 && (
            <p class="mt-2 flex gap-2 text-[12px] leading-5 text-warn">
              <TriangleAlert size={15} class="mt-0.5 shrink-0" />
              {t('plain_ports_warn')}
            </p>
          )}
        </Field>
        <div class="grid gap-4 sm:grid-cols-3">
          <Field label={t('fingerprint')}>
            <Select value={v.fingerprint} onChange={(e) => set({ fingerprint: e.currentTarget.value })}>
              {FINGERPRINTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('alpn')}>
            <Select value={v.alpn} onChange={(e) => set({ alpn: e.currentTarget.value })}>
              <option value="http/1.1">http/1.1</option>
              <option value="h2,http/1.1">h2, http/1.1</option>
              <option value="">—</option>
            </Select>
          </Field>
          <Field label={t('early_data')} hint={t('early_data_hint')}>
            <Input
              ltr
              type="number"
              min={0}
              max={8192}
              value={v.earlyData}
              onInput={(e) =>
                set({ earlyData: Math.max(0, Math.min(8192, Number(e.currentTarget.value) || 0)) })
              }
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

function ContentCard({ s }: { s: ReturnType<typeof useSettings<'sub'>> }) {
  const v = s.value!;
  const set = (patch: Partial<SettingsMap['sub']>) => s.setValue({ ...v, ...patch });
  const fa = lang.value === 'fa';
  const preview = renderName(v.nameTemplate, {
    flag: flagEmoji('DE'),
    country: fa ? 'آلمان' : 'Germany',
    op: fa ? 'ایرانسل' : 'Irancell',
    ip: '104.16.1.1',
    port: '443',
    proto: 'VLESS',
    user: 'ali',
    n: '1',
  });
  return (
    <Card
      title={<Title icon={<Globe size={18} />}>{t('sub_content')}</Title>}
      actions={
        <SaveBtn
          loading={s.saving}
          onClick={() =>
            s.save({
              profileTitle: v.profileTitle,
              updateIntervalHours: v.updateIntervalHours,
              nameTemplate: v.nameTemplate,
              infoNodes: v.infoNodes,
              includeAuto: v.includeAuto,
              includeCountries: v.includeCountries,
              maxNodes: v.maxNodes,
              ipsPerOperator: v.ipsPerOperator,
            })
          }
        />
      }
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile_title')}>
            <Input value={v.profileTitle} onInput={(e) => set({ profileTitle: e.currentTarget.value })} />
          </Field>
          <Field label={t('update_hours')}>
            <Input
              ltr
              type="number"
              min={1}
              max={168}
              value={v.updateIntervalHours}
              onInput={(e) => set({ updateIntervalHours: Math.max(1, Number(e.currentTarget.value) || 1) })}
            />
          </Field>
        </div>
        <Field label={t('name_template')} hint={t('name_template_hint')}>
          <Input
            dir="auto"
            value={v.nameTemplate}
            onInput={(e) => set({ nameTemplate: e.currentTarget.value })}
          />
        </Field>
        <div class="rounded-xl border border-dashed border-line-2 bg-surface-2 px-3.5 py-2.5 text-[13px]">
          <span class="text-muted">{t('name_preview')}: </span>
          <span class="font-semibold">{preview || '—'}</span>
        </div>
        <div class="divide-y divide-line">
          <Switch
            checked={v.infoNodes}
            onChange={(x) => set({ infoNodes: x })}
            label={t('info_nodes')}
            description={t('info_nodes_hint')}
          />
          <Switch
            checked={v.includeAuto}
            onChange={(x) => set({ includeAuto: x })}
            label={t('include_auto')}
            description={t('include_auto_hint')}
          />
          <Switch
            checked={v.includeCountries}
            onChange={(x) => set({ includeCountries: x })}
            label={t('include_countries')}
          />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('max_nodes')}>
            <Input
              ltr
              type="number"
              min={1}
              max={300}
              value={v.maxNodes}
              onInput={(e) => set({ maxNodes: Math.max(1, Number(e.currentTarget.value) || 1) })}
            />
          </Field>
          <Field label={t('ips_per_op')}>
            <Input
              ltr
              type="number"
              min={1}
              max={30}
              value={v.ipsPerOperator}
              onInput={(e) => set({ ipsPerOperator: Math.max(1, Number(e.currentTarget.value) || 1) })}
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

function AntiFilterCard({ s }: { s: ReturnType<typeof useSettings<'sub'>> }) {
  const v = s.value!;
  const f = v.fragment;
  const setF = (patch: Partial<SettingsMap['sub']['fragment']>) =>
    s.setValue({ ...v, fragment: { ...f, ...patch } });
  const r = v.rules;
  const setR = (patch: Partial<SettingsMap['sub']['rules']>) =>
    s.setValue({ ...v, rules: { ...r, ...patch } });
  return (
    <>
      <Card
        title={<Title icon={<Scissors size={18} />}>{t('sub_antifilter')}</Title>}
        actions={<SaveBtn loading={s.saving} onClick={() => s.save({ fragment: f })} />}
      >
        <Switch
          checked={f.enabled}
          onChange={(x) => setF({ enabled: x })}
          label={t('fragment_enabled')}
          description={t('op_fragment_hint')}
        />
        <div class={cx('mt-3 grid grid-cols-3 gap-3', !f.enabled && 'opacity-60')}>
          <Field label={t('fragment_packets')}>
            <Input ltr value={f.packets} onInput={(e) => setF({ packets: e.currentTarget.value })} />
          </Field>
          <Field label={t('fragment_length')}>
            <Input ltr value={f.length} onInput={(e) => setF({ length: e.currentTarget.value })} />
          </Field>
          <Field label={t('fragment_interval')}>
            <Input ltr value={f.interval} onInput={(e) => setF({ interval: e.currentTarget.value })} />
          </Field>
        </div>
      </Card>
      <Card
        title={<Title icon={<ShieldBan size={18} />}>{t('sub_rules')}</Title>}
        actions={<SaveBtn loading={s.saving} onClick={() => s.save({ rules: r })} />}
      >
        <p class="-mt-1 mb-2 text-[12.5px] text-muted">{t('sub_rules_hint')}</p>
        <div class="divide-y divide-line">
          <Switch
            checked={r.iranDirect}
            onChange={(x) => setR({ iranDirect: x })}
            label={t('rule_iran_direct')}
            description={t('rule_iran_direct_hint')}
          />
          <Switch
            checked={r.blockQuic}
            onChange={(x) => setR({ blockQuic: x })}
            label={t('rule_block_quic')}
            description={t('rule_block_quic_hint')}
          />
          <Switch checked={r.blockAds} onChange={(x) => setR({ blockAds: x })} label={t('rule_block_ads')} />
          <Switch
            checked={r.blockPorn}
            onChange={(x) => setR({ blockPorn: x })}
            label={t('rule_block_porn')}
          />
        </div>
      </Card>
    </>
  );
}

function BrandingCard({ g }: { g: ReturnType<typeof useSettings<'general'>> }) {
  const v = g.value!;
  const set = (patch: Partial<SettingsMap['general']>) => g.setValue({ ...v, ...patch });
  return (
    <Card
      title={<Title icon={<Palette size={18} />}>{t('sub_branding')}</Title>}
      actions={
        <SaveBtn
          loading={g.saving}
          onClick={() =>
            g.save({
              brandTitle: v.brandTitle,
              supportUrl: v.supportUrl.trim(),
              announcement: v.announcement,
              language: v.language,
            })
          }
        />
      }
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('brand_title')}>
            <Input value={v.brandTitle} onInput={(e) => set({ brandTitle: e.currentTarget.value })} />
          </Field>
          <Field label={t('default_language')}>
            <Select
              value={v.language}
              onChange={(e) => set({ language: e.currentTarget.value as 'fa' | 'en' })}
            >
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>
        <Field label={t('support_url')} hint={t('support_url_hint')}>
          <Input ltr value={v.supportUrl} onInput={(e) => set({ supportUrl: e.currentTarget.value })} />
        </Field>
        <Field label={t('announcement')} hint={t('announcement_hint')}>
          <Textarea
            rows={3}
            value={v.announcement}
            onInput={(e) => set({ announcement: e.currentTarget.value })}
          />
        </Field>
      </div>
    </Card>
  );
}

export function SubscriptionPage() {
  const general = useSettings('general');
  const proxy = useSettings('proxy');
  const sub = useSettings('sub');
  const ready = general.value && proxy.value && sub.value;
  return (
    <>
      <PageHeader title={t('sub_title')} subtitle={t('sub_subtitle')} />
      {!ready ? (
        <div class="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} class="h-64 w-full rounded-xl2" />
          ))}
        </div>
      ) : (
        <div class="grid items-start gap-4 lg:grid-cols-2">
          <div class="space-y-4">
            <LinksCard g={general} />
            <ContentCard s={sub} />
            <BrandingCard g={general} />
          </div>
          <div class="space-y-4">
            <ProtocolsCard p={proxy} />
            <AntiFilterCard s={sub} />
          </div>
        </div>
      )}
    </>
  );
}
