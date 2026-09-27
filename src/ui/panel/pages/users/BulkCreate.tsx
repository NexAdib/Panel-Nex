import { Layers } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { GB } from '../../../../shared/constants';
import type { PlanDto, UserDto } from '../../../../shared/types';
import { ApiError, api } from '../../../common/api';
import { Modal, toast } from '../../../common/components/overlay';
import { CopyButton } from '../../../common/components/qr';
import { Button, Field, Input, Switch } from '../../../common/components/ui';
import { t, tMaybe } from '../../../common/i18n';
import { Chip, DataLimitPicker, DevicePicker, DurationPicker } from './pickers';

export function BulkCreate({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [prefix, setPrefix] = useState('user');
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(10);
  const [dataLimit, setDataLimit] = useState(30 * GB);
  const [days, setDays] = useState(30);
  const [onHold, setOnHold] = useState(true);
  const [devices, setDevices] = useState(2);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [planId, setPlanId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<UserDto[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setError(null);
    api<{ items: PlanDto[] }>('plans')
      .then((r) => setPlans(r.items))
      .catch(() => {});
  }, [open]);

  const width = String(start + count - 1).length;
  const name = (i: number) => `${prefix}${String(start + i).padStart(width, '0')}`;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ items: UserDto[] }>('users/batch-create', 'POST', {
        prefix,
        start,
        count,
        template: { dataLimit, days, onHold: onHold && days > 0, deviceLimit: devices, planId },
      });
      setCreated(res.items);
      toast(t('batch_done', { n: res.items.length }));
      onDone();
    } catch (err) {
      setError(tMaybe(`err_${err instanceof ApiError ? err.code : ''}`, t('error_generic')));
    } finally {
      setBusy(false);
    }
  }

  const links = created?.map((u) => `${u.name}\n${u.subUrl}`).join('\n\n') ?? '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('batch_title')}
      footer={
        created ? (
          <>
            <CopyButton text={links} label={t('batch_copy_links')} variant="soft" size="md" />
            <Button variant="primary" onClick={onClose}>
              {t('done')}
            </Button>
          </>
        ) : (
          <Button variant="primary" loading={busy} icon={<Layers size={16} />} onClick={submit}>
            {t('create')}
          </Button>
        )
      }
    >
      {created ? (
        <div class="ltr-num max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-mono text-[12px]">
          {links}
        </div>
      ) : (
        <div class="space-y-5">
          <div class="grid grid-cols-3 gap-3">
            <Field label={t('batch_prefix')} class="col-span-3 sm:col-span-1">
              <Input ltr value={prefix} maxLength={40} onInput={(e) => setPrefix(e.currentTarget.value)} />
            </Field>
            <Field label={t('batch_start')}>
              <Input
                ltr
                type="number"
                min={0}
                value={start}
                onInput={(e) => setStart(Math.max(0, Number(e.currentTarget.value) || 0))}
              />
            </Field>
            <Field label={t('batch_count')}>
              <Input
                ltr
                type="number"
                min={1}
                max={200}
                value={count}
                onInput={(e) => setCount(Math.min(200, Math.max(1, Number(e.currentTarget.value) || 1)))}
              />
            </Field>
          </div>
          <p class="text-[12.5px] text-muted">
            {t('batch_preview', { first: name(0), last: name(count - 1) })}
          </p>
          {plans.length > 0 && (
            <Field label={t('f_plan')}>
              <div class="flex flex-wrap gap-1.5">
                {plans.map((p) => (
                  <Chip
                    key={p.id}
                    active={planId === p.id}
                    onClick={() => {
                      setPlanId(p.id);
                      setDataLimit(p.dataLimit);
                      setDays(p.durationDays);
                      setDevices(p.deviceLimit);
                      setOnHold(p.onHold);
                    }}
                  >
                    {p.name}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
          <Field label={t('f_data')}>
            <DataLimitPicker value={dataLimit} onChange={setDataLimit} />
          </Field>
          <Field label={t('f_duration')}>
            <DurationPicker value={days} onChange={setDays} />
          </Field>
          <Switch
            checked={onHold && days > 0}
            disabled={days === 0}
            onChange={setOnHold}
            label={t('f_on_hold')}
            description={t('f_on_hold_hint')}
          />
          <Field label={t('f_devices')}>
            <DevicePicker value={devices} onChange={setDevices} />
          </Field>
          {error && <p class="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
