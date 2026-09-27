import { ChevronDown, Save } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { DAY_MS, DEFAULT_OPERATORS, GB, type ResetStrategy } from '../../../../shared/constants';
import type { PlanDto, UserDto, UserInput } from '../../../../shared/types';
import { ApiError, api } from '../../../common/api';
import { Drawer, toast } from '../../../common/components/overlay';
import { Button, cx, Field, Input, Segmented, Select, Switch, Textarea } from '../../../common/components/ui';
import { fmtDate } from '../../../common/format';
import { lang, t, tMaybe } from '../../../common/i18n';
import { Chip, DataLimitPicker, DevicePicker, DurationPicker, ExitsPicker } from './pickers';

interface FormState {
  name: string;
  dataLimit: number;
  days: number;
  onHold: boolean;
  deviceLimit: number;
  resetStrategy: ResetStrategy;
  allowedExits: string[];
  forceExit: boolean;
  operator: string;
  warpEnabled: boolean;
  filterExempt: boolean;
  note: string;
  tags: string;
  planId: number | null;
}

function fromUser(u: UserDto): FormState {
  const remaining = u.expireAt ? Math.max(0, Math.ceil((u.expireAt - Date.now()) / DAY_MS)) : 0;
  return {
    name: u.name,
    dataLimit: u.dataLimit,
    days: u.status === 'on_hold' ? (u.durationDays ?? 30) : remaining,
    onHold: u.status === 'on_hold',
    deviceLimit: u.deviceLimit,
    resetStrategy: u.resetStrategy,
    allowedExits: u.allowedExits.length ? u.allowedExits : ['*'],
    forceExit: u.forceExit,
    operator: u.operator ?? '',
    warpEnabled: u.warpEnabled,
    filterExempt: u.filterExempt,
    note: u.note,
    tags: u.tags.join(', '),
    planId: u.planId,
  };
}

const EMPTY: FormState = {
  name: '',
  dataLimit: 30 * GB,
  days: 30,
  onHold: false,
  deviceLimit: 2,
  resetStrategy: 'none',
  allowedExits: ['*'],
  forceExit: false,
  operator: '',
  warpEnabled: true,
  filterExempt: false,
  note: '',
  tags: '',
  planId: null,
};

export function UserForm({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: UserDto | null;
  onClose: () => void;
  onSaved: (u: UserDto) => void;
}) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(user ? fromUser(user) : EMPTY);
    setError(null);
    setAdv(false);
    api<{ items: PlanDto[] }>('plans')
      .then((r) => setPlans(r.items))
      .catch(() => {});
  }, [open, user?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));

  function applyPlan(p: PlanDto) {
    setF((prev) => ({
      ...prev,
      planId: p.id,
      dataLimit: p.dataLimit,
      days: p.durationDays,
      onHold: p.onHold,
      deviceLimit: p.deviceLimit,
      resetStrategy: p.resetStrategy,
      allowedExits: p.allowedExits,
      warpEnabled: p.warpEnabled,
    }));
  }

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: UserInput & { rev?: number } = {
      name: f.name.trim(),
      dataLimit: f.dataLimit,
      days: f.days,
      onHold: f.onHold && f.days > 0,
      deviceLimit: f.deviceLimit,
      resetStrategy: f.resetStrategy,
      allowedExits: f.allowedExits,
      forceExit: f.forceExit,
      operator: f.operator || null,
      warpEnabled: f.warpEnabled,
      filterExempt: f.filterExempt,
      note: f.note,
      tags: f.tags
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
      planId: f.planId,
    };
    try {
      let saved: UserDto;
      if (user) {
        // Only send the duration when it changed, so editing a note never moves the expiry.
        const orig = fromUser(user);
        if (orig.days === f.days && orig.onHold === f.onHold) delete body.days;
        saved = await api<UserDto>(`users/${user.id}`, 'PATCH', { ...body, rev: user.rev });
        toast(t('user_saved'));
      } else {
        saved = await api<UserDto>('users', 'POST', body);
        toast(t('user_created'));
      }
      onSaved(saved);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      setError(tMaybe(`err_${code}`, t('error_generic')));
    } finally {
      setBusy(false);
    }
  }

  const expiryPreview =
    f.days > 0 && !f.onHold ? t('f_expire_preview', { date: fmtDate(Date.now() + f.days * DAY_MS) }) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={user ? t('user_edit') : t('user_new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" loading={busy} icon={<Save size={16} />} onClick={submit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form class="space-y-6" onSubmit={submit}>
        <Field label={t('f_name')} hint={t('f_name_hint')}>
          <Input value={f.name} maxLength={64} required onInput={(e) => set('name', e.currentTarget.value)} />
        </Field>

        {!user && plans.length > 0 && (
          <Field label={t('f_plan')}>
            <div class="flex flex-wrap gap-1.5">
              {plans.map((p) => (
                <Chip key={p.id} active={f.planId === p.id} onClick={() => applyPlan(p)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        <Field label={t('f_data')}>
          <DataLimitPicker value={f.dataLimit} onChange={(v) => set('dataLimit', v)} />
        </Field>

        <Field label={user && !f.onHold ? t('f_days_left') : t('f_duration')} hint={expiryPreview}>
          <DurationPicker value={f.days} onChange={(v) => set('days', v)} />
        </Field>

        {(!user || user.status === 'on_hold' || f.onHold) && (
          <Switch
            checked={f.onHold && f.days > 0}
            onChange={(v) => set('onHold', v)}
            disabled={f.days === 0}
            label={t('f_on_hold')}
            description={t('f_on_hold_hint')}
          />
        )}

        <Field label={t('f_devices')}>
          <DevicePicker value={f.deviceLimit} onChange={(v) => set('deviceLimit', v)} />
        </Field>

        <Field label={t('f_reset')}>
          <Segmented<ResetStrategy>
            value={f.resetStrategy}
            onChange={(v) => set('resetStrategy', v)}
            options={[
              { value: 'none', label: t('reset_none') },
              { value: 'daily', label: t('reset_daily') },
              { value: 'weekly', label: t('reset_weekly') },
              { value: 'monthly', label: t('reset_monthly') },
            ]}
          />
        </Field>

        <div class="rounded-2xl border border-line">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-sm font-bold"
            onClick={() => setAdv(!adv)}
          >
            {t('f_advanced')}
            <ChevronDown size={18} class={cx('transition-transform', adv && 'rotate-180')} />
          </button>
          {adv && (
            <div class="space-y-5 border-t border-line px-4 py-4">
              <Field label={t('f_exits')}>
                <ExitsPicker value={f.allowedExits} onChange={(v) => set('allowedExits', v)} />
              </Field>
              <Switch
                checked={f.forceExit}
                onChange={(v) => set('forceExit', v)}
                label={t('f_force_exit')}
                description={t('f_force_exit_hint')}
              />
              <Field label={t('f_operator')}>
                <Select value={f.operator} onChange={(e) => set('operator', e.currentTarget.value)}>
                  <option value="">{t('f_operator_auto')}</option>
                  {DEFAULT_OPERATORS.filter((o) => o.code !== 'all').map((o) => (
                    <option key={o.code} value={o.code}>
                      {lang.value === 'fa' ? o.fa : o.en}
                    </option>
                  ))}
                </Select>
              </Field>
              <Switch checked={f.warpEnabled} onChange={(v) => set('warpEnabled', v)} label={t('f_warp')} />
              <Switch
                checked={f.filterExempt}
                onChange={(v) => set('filterExempt', v)}
                label={t('f_filter_exempt')}
              />
            </div>
          )}
        </div>

        <Field label={t('f_tags')} hint={t('f_tags_hint')}>
          <Input value={f.tags} onInput={(e) => set('tags', e.currentTarget.value)} />
        </Field>
        <Field label={t('f_note')}>
          <Textarea
            value={f.note}
            maxLength={500}
            rows={3}
            onInput={(e) => set('note', e.currentTarget.value)}
          />
        </Field>

        {error && <p class="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
        <button type="submit" class="hidden" />
      </form>
    </Drawer>
  );
}
