import { Layers, Pencil, Plus, Save, Trash2 } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { GB, type ResetStrategy } from '../../../shared/constants';
import type { PlanDto } from '../../../shared/types';
import { api } from '../../common/api';
import { confirmDialog, Modal, toast } from '../../common/components/overlay';
import {
  Button,
  Card,
  Empty,
  Field,
  IconButton,
  Input,
  Segmented,
  Skeleton,
  Switch,
} from '../../common/components/ui';
import { fmtBytes, fmtNumber } from '../../common/format';
import { t } from '../../common/i18n';
import { PageHeader } from '../components/page';
import { durationLabel } from './users/labels';
import { DataLimitPicker, DevicePicker, DurationPicker, ExitsPicker } from './users/pickers';

type Draft = Omit<PlanDto, 'id'> & { id?: number };
const EMPTY: Draft = {
  name: '',
  dataLimit: 30 * GB,
  durationDays: 30,
  deviceLimit: 2,
  allowedExits: ['*'],
  warpEnabled: true,
  resetStrategy: 'none',
  onHold: false,
  sort: 0,
};

export function PlansPage() {
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ items: PlanDto[] }>('plans')
      .then((r) => setPlans(r.items))
      .catch(() => toast(t('error_generic'), 'bad'));
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const { id, ...body } = draft;
      if (id) await api(`plans/${id}`, 'PATCH', body);
      else await api('plans', 'POST', body);
      toast(t('saved'));
      setDraft(null);
      load();
    } catch {
      toast(t('error_generic'), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: PlanDto) {
    if (!(await confirmDialog({ title: t('confirm_title'), body: t('plan_delete_confirm'), danger: true })))
      return;
    await api(`plans/${p.id}`, 'DELETE');
    load();
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader
        title={t('plans_title')}
        subtitle={t('plans_subtitle')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDraft({ ...EMPTY })}>
            {t('plan_new')}
          </Button>
        }
      />
      {!plans ? (
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} class="h-32 w-full rounded-xl2" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <Empty icon={<Layers size={26} />} title={t('plan_new')} />
        </Card>
      ) : (
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} class="card animate-pop relative overflow-hidden p-5">
              <div class="aurora pointer-events-none absolute inset-0 opacity-60" />
              <div class="relative flex items-start justify-between gap-2">
                <h3 class="text-[15.5px] font-black">{p.name}</h3>
                <div class="flex">
                  <IconButton label={t('edit')} onClick={() => setDraft({ ...p })}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={t('delete')} onClick={() => remove(p)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
              <div class="relative mt-3 text-2xl font-black text-grad">
                {p.dataLimit ? fmtBytes(p.dataLimit, 0) : `∞ ${t('unlimited')}`}
              </div>
              <div class="relative mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
                <span>{durationLabel(p.durationDays)}</span>
                <span>
                  {p.deviceLimit ? t('devices_n', { n: fmtNumber(p.deviceLimit) }) : t('unlimited_devices')}
                </span>
                {p.onHold && <span>{t('f_on_hold')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        wide
        title={draft?.id ? t('plan_edit') : t('plan_new')}
        footer={
          <Button
            variant="primary"
            loading={busy}
            icon={<Save size={16} />}
            onClick={save}
            disabled={!draft?.name.trim()}
          >
            {t('save')}
          </Button>
        }
      >
        {draft && (
          <div class="space-y-5">
            <Field label={t('name')}>
              <Input value={draft.name} maxLength={60} onInput={(e) => set('name', e.currentTarget.value)} />
            </Field>
            <Field label={t('f_data')}>
              <DataLimitPicker value={draft.dataLimit} onChange={(v) => set('dataLimit', v)} />
            </Field>
            <Field label={t('f_duration')}>
              <DurationPicker value={draft.durationDays} onChange={(v) => set('durationDays', v)} />
            </Field>
            <Switch
              checked={draft.onHold}
              onChange={(v) => set('onHold', v)}
              label={t('f_on_hold')}
              description={t('f_on_hold_hint')}
            />
            <Field label={t('f_devices')}>
              <DevicePicker value={draft.deviceLimit} onChange={(v) => set('deviceLimit', v)} />
            </Field>
            <Field label={t('f_reset')}>
              <Segmented<ResetStrategy>
                value={draft.resetStrategy}
                onChange={(v) => set('resetStrategy', v)}
                options={[
                  { value: 'none', label: t('reset_none') },
                  { value: 'daily', label: t('reset_daily') },
                  { value: 'weekly', label: t('reset_weekly') },
                  { value: 'monthly', label: t('reset_monthly') },
                ]}
              />
            </Field>
            <Field label={t('f_exits')}>
              <ExitsPicker value={draft.allowedExits} onChange={(v) => set('allowedExits', v)} />
            </Field>
            <Switch checked={draft.warpEnabled} onChange={(v) => set('warpEnabled', v)} label={t('f_warp')} />
          </div>
        )}
      </Modal>
    </>
  );
}
