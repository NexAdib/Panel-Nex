import {
  Ban,
  CalendarPlus,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Pencil,
  Power,
  RotateCcw,
  Trash2,
} from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import type { UserDto } from '../../../../shared/types';
import { ApiError, api } from '../../../common/api';
import { confirmDialog, Drawer, Modal, toast } from '../../../common/components/overlay';
import { CopyButton, QrCode } from '../../../common/components/qr';
import { Badge, Button, Ring } from '../../../common/components/ui';
import { fmtBytes, fmtDate, fmtNumber, fmtRelative } from '../../../common/format';
import { t, tMaybe } from '../../../common/i18n';
import { expiryText, STATUS_KEY, STATUS_TONE, usagePercent } from './labels';
import { Chip } from './pickers';

function Row({ label, value }: { label: string; value: preact.ComponentChildren }) {
  return (
    <div class="flex items-center justify-between gap-3 py-2 text-[13px]">
      <span class="text-muted">{label}</span>
      <span class="font-semibold">{value}</span>
    </div>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [show, setShow] = useState(false);
  return (
    <div class="rounded-xl border border-line bg-surface-2 p-3">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-[12px] font-semibold text-muted">{label}</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-lg p-1.5 text-muted hover:text-fg"
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <CopyButton text={value} variant="ghost" />
        </div>
      </div>
      <div class="ltr-num break-all font-mono text-[12.5px]">
        {show ? value : '•'.repeat(Math.min(28, value.length))}
      </div>
    </div>
  );
}

type Prompt = 'extend' | 'data' | null;

export function UserDetail({
  user,
  onClose,
  onChanged,
  onEdit,
  onDeleted,
}: {
  user: UserDto | null;
  onClose: () => void;
  onChanged: (u: UserDto) => void;
  onEdit: (u: UserDto) => void;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [amount, setAmount] = useState(30);

  useEffect(() => setPrompt(null), [user?.id]);
  if (!user) return null;
  const u = user;

  async function act(
    action: string,
    body: Record<string, unknown> = {},
    confirm?: { body: string; danger?: boolean },
  ) {
    if (
      confirm &&
      !(await confirmDialog({ title: t('confirm_title'), body: confirm.body, danger: confirm.danger }))
    )
      return;
    setBusy(action);
    try {
      if (action === 'delete') {
        await api(`users/${u.id}`, 'DELETE');
        onDeleted(u.id);
      } else {
        const next = await api<UserDto>(`users/${u.id}/${action}`, 'POST', body);
        onChanged(next);
      }
      toast(t('saved'));
      setPrompt(null);
    } catch (err) {
      toast(tMaybe(`err_${err instanceof ApiError ? err.code : ''}`, t('error_generic')), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const pct = usagePercent(u);
  const exp = expiryText(u);

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span class="flex items-center gap-2">
          {u.name}
          <Badge tone={STATUS_TONE[u.status]} dot>
            {t(STATUS_KEY[u.status])}
          </Badge>
        </span>
      }
    >
      <div class="space-y-5">
        <div class="flex items-center gap-5">
          <Ring value={u.dataLimit ? pct : 0} size={112}>
            <div>
              <div class="text-lg font-black">{u.dataLimit ? `${fmtNumber(pct)}%` : '∞'}</div>
              <div class="text-[11px] text-muted">{t('col_usage')}</div>
            </div>
          </Ring>
          <div class="min-w-0 flex-1 text-[13px]">
            <div class="text-xl font-black">
              {fmtBytes(u.used)}
              <span class="ms-1 text-[13px] font-semibold text-muted">
                {t('of')} {u.dataLimit ? fmtBytes(u.dataLimit) : t('unlimited')}
              </span>
            </div>
            <div class="mt-1 font-semibold">{exp.main}</div>
            {exp.sub && <div class="text-muted">{exp.sub}</div>}
          </div>
        </div>

        <section class="rounded-2xl border border-line p-4">
          <div class="mb-1 flex items-center gap-2 text-sm font-bold">
            <Link2 size={16} class="text-brand" />
            {t('ud_sub_link')}
          </div>
          <p class="mb-3 text-[12.5px] text-muted">{t('ud_sub_hint')}</p>
          <div class="ltr-num mb-3 break-all rounded-xl bg-surface-2 p-3 font-mono text-[12.5px]">
            {u.subUrl}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <CopyButton text={u.subUrl} variant="soft" />
            <Button
              size="sm"
              variant="secondary"
              icon={<ExternalLink size={15} />}
              onClick={() => window.open(u.subUrl, '_blank', 'noopener')}
            >
              {t('ud_open_page')}
            </Button>
          </div>
          <div class="mt-4 flex justify-center">
            <QrCode value={u.subUrl} size={200} />
          </div>
        </section>

        <section class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="sm" icon={<Pencil size={15} />} onClick={() => onEdit(u)}>
            {t('edit')}
          </Button>
          <Button
            size="sm"
            icon={<CalendarPlus size={15} />}
            onClick={() => {
              setAmount(30);
              setPrompt('extend');
            }}
          >
            {t('act_extend')}
          </Button>
          <Button
            size="sm"
            icon={<Database size={15} />}
            disabled={u.dataLimit === 0}
            onClick={() => {
              setAmount(10);
              setPrompt('data');
            }}
          >
            {t('act_add_data')}
          </Button>
          <Button
            size="sm"
            icon={<RotateCcw size={15} />}
            loading={busy === 'reset'}
            onClick={() => act('reset', {}, { body: t('act_reset_confirm') })}
          >
            {t('act_reset_usage')}
          </Button>
          {u.status === 'disabled' ? (
            <Button
              size="sm"
              icon={<Power size={15} />}
              loading={busy === 'enable'}
              onClick={() => act('enable')}
            >
              {t('act_enable')}
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<Ban size={15} />}
              loading={busy === 'disable'}
              onClick={() => act('disable')}
            >
              {t('act_disable')}
            </Button>
          )}
          <Button
            size="sm"
            icon={<Link2 size={15} />}
            loading={busy === 'revoke'}
            onClick={() => act('revoke', {}, { body: t('act_revoke_confirm') })}
          >
            {t('act_revoke')}
          </Button>
          <Button
            size="sm"
            icon={<KeyRound size={15} />}
            loading={busy === 'regenerate'}
            onClick={() => act('regenerate', {}, { body: t('act_regenerate_confirm'), danger: true })}
          >
            {t('act_regenerate')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={15} />}
            loading={busy === 'delete'}
            onClick={() => act('delete', {}, { body: t('act_delete_confirm'), danger: true })}
          >
            {t('delete')}
          </Button>
        </section>

        <section class="divide-y divide-line rounded-2xl border border-line px-4">
          <Row label={t('ud_upload')} value={fmtBytes(u.usedUp)} />
          <Row label={t('ud_download')} value={fmtBytes(u.usedDown)} />
          <Row label={t('ud_lifetime')} value={fmtBytes(u.lifetimeUsed + u.used)} />
          <Row label={t('f_devices')} value={u.deviceLimit ? fmtNumber(u.deviceLimit) : t('unlimited')} />
          <Row
            label={t('col_online')}
            value={u.lastOnlineAt ? fmtRelative(u.lastOnlineAt) : t('never_online')}
          />
          <Row label={t('ud_last_sub')} value={u.subUpdatedAt ? fmtRelative(u.subUpdatedAt) : '—'} />
          <Row label={t('ud_created')} value={fmtDate(u.createdAt)} />
        </section>

        <section class="space-y-2">
          <div class="text-sm font-bold">{t('ud_credentials')}</div>
          <SecretRow label={t('ud_uuid')} value={u.uuid} />
          <SecretRow label={t('ud_trojan')} value={u.trojanPassword} />
        </section>

        {u.note && <p class="rounded-xl bg-surface-2 p-3 text-[13px] text-fg-2">{u.note}</p>}
      </div>

      <Modal
        open={prompt !== null}
        onClose={() => setPrompt(null)}
        title={prompt === 'extend' ? t('extend_title') : t('add_data_title')}
        footer={
          <Button
            variant="primary"
            loading={busy === 'extend' || busy === 'add-data'}
            onClick={() =>
              prompt === 'extend' ? act('extend', { days: amount }) : act('add-data', { gb: amount })
            }
          >
            {t('confirm')}
          </Button>
        }
      >
        <div class="flex flex-wrap gap-1.5">
          {(prompt === 'extend' ? [7, 30, 60, 90, 180, 365] : [1, 5, 10, 20, 30, 50, 100]).map((n) => (
            <Chip key={n} active={amount === n} onClick={() => setAmount(n)}>
              {fmtNumber(n)} {prompt === 'extend' ? t('days') : t('gb')}
            </Chip>
          ))}
        </div>
        <input
          type="number"
          min="1"
          dir="ltr"
          value={amount}
          onInput={(e) => setAmount(Math.max(1, Number(e.currentTarget.value) || 1))}
          class="mt-3 h-10 w-32 rounded-xl border border-line bg-surface-2 px-3"
        />
      </Modal>
    </Drawer>
  );
}
