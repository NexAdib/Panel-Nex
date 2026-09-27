import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Layers,
  Link2,
  Power,
  PowerOff,
  QrCode as QrIcon,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { UserStatus } from '../../../../shared/constants';
import type { BulkAction, UserDto, UserListResponse } from '../../../../shared/types';
import { api } from '../../../common/api';
import { confirmDialog, Modal, toast } from '../../../common/components/overlay';
import { CopyButton, copyText, QrCode } from '../../../common/components/qr';
import {
  Badge,
  Button,
  Card,
  cx,
  Empty,
  IconButton,
  Progress,
  Select,
  Skeleton,
} from '../../../common/components/ui';
import { fmtBytes, fmtNumber, fmtRelative } from '../../../common/format';
import { isRtl, t } from '../../../common/i18n';
import { PageHeader } from '../../components/page';
import { route } from '../../router';
import { BulkCreate } from './BulkCreate';
import { expiryText, STATUS_KEY, STATUS_TONE, usagePercent } from './labels';
import { Chip } from './pickers';
import { UserDetail } from './UserDetail';
import { UserForm } from './UserForm';

type Filter = UserStatus | 'all';
const FILTERS: Filter[] = ['all', 'active', 'on_hold', 'limited', 'expired', 'disabled'];
type Sort = 'created' | 'name' | 'used' | 'expire' | 'online';

export function UsersPage() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    const f = route.value.query.get('status') as Filter | null;
    return f && FILTERS.includes(f) ? f : 'all';
  });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('created');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(() => route.value.query.get('new') === '1');
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [detail, setDetail] = useState<UserDto | null>(null);
  const [qrFor, setQrFor] = useState<UserDto | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [bulkPrompt, setBulkPrompt] = useState<'extend' | 'add_data' | null>(null);
  const [bulkAmount, setBulkAmount] = useState(30);
  const reqId = useRef(0);

  async function load() {
    const id = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), size: String(size), sort });
    if (filter !== 'all') params.set('status', filter);
    if (q.trim()) params.set('q', q.trim());
    if (sort === 'name' || sort === 'expire') params.set('order', 'asc');
    try {
      const res = await api<UserListResponse>(`users?${params}`);
      if (id === reqId.current) setData(res);
    } catch {
      if (id === reqId.current) toast(t('error_generic'), 'bad');
    }
  }

  useEffect(() => {
    const h = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(h);
  }, [filter, q, sort, page, size]);

  useEffect(() => setPage(1), [filter, q, sort, size]);
  useEffect(() => setSelected(new Set()), [filter, q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const allChecked = !!data?.items.length && data.items.every((u) => selected.has(u.id));

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function replace(u: UserDto) {
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) } : d));
    if (detail?.id === u.id) setDetail(u);
  }

  async function bulk(action: BulkAction, extra: Record<string, number> = {}) {
    const ids = [...selected];
    if (!ids.length) return;
    if (
      action === 'delete' &&
      !(await confirmDialog({
        title: t('confirm_title'),
        body: t('bulk_delete_confirm', { n: ids.length }),
        danger: true,
      }))
    )
      return;
    try {
      await api('users-bulk', 'POST', { ids, action, ...extra });
      toast(t('bulk_done', { n: ids.length }));
      setSelected(new Set());
      setBulkPrompt(null);
      load();
    } catch {
      toast(t('error_generic'), 'bad');
    }
  }

  const Prev = isRtl.value ? ChevronRight : ChevronLeft;
  const Next = isRtl.value ? ChevronLeft : ChevronRight;

  const empty = data && data.counts.all === 0;

  return (
    <>
      <PageHeader
        title={
          <span class="flex items-center gap-2">
            {t('users_title')}
            {data && <Badge tone="brand">{fmtNumber(data.counts.all)}</Badge>}
          </span>
        }
        subtitle={t('users_subtitle')}
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Download size={16} />}
              onClick={() => window.open('api/users-export.csv', '_blank')}
            >
              <span class="hidden sm:inline">{t('users_export')}</span>
            </Button>
            <Button icon={<Layers size={16} />} onClick={() => setBatchOpen(true)}>
              {t('users_batch')}
            </Button>
            <Button
              variant="primary"
              icon={<UserPlus size={16} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('user_new')}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div class="mb-4 space-y-3">
        <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {t(f === 'all' ? 'st_all' : STATUS_KEY[f])}
              <span class="ms-1.5 opacity-70">{fmtNumber(data?.counts[f] ?? 0)}</span>
            </Chip>
          ))}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <Search size={16} class="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted" />
            <input
              class="h-10 w-full rounded-xl border border-line bg-surface-2 ps-9 pe-3 text-sm focus:border-brand focus:outline-none"
              placeholder={t('search')}
              value={q}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
          </div>
          <Select
            class="!h-10 w-auto min-w-36"
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as Sort)}
          >
            {(['created', 'name', 'used', 'expire', 'online'] as Sort[]).map((s) => (
              <option key={s} value={s}>
                {t(`sort_${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div class="card glass animate-pop sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span class="me-2 text-[13px] font-bold">{t('selected_n', { n: selected.size })}</span>
          <Button size="sm" icon={<Power size={14} />} onClick={() => bulk('enable')}>
            {t('bulk_enable')}
          </Button>
          <Button size="sm" icon={<PowerOff size={14} />} onClick={() => bulk('disable')}>
            {t('bulk_disable')}
          </Button>
          <Button
            size="sm"
            icon={<CalendarPlus size={14} />}
            onClick={() => {
              setBulkAmount(30);
              setBulkPrompt('extend');
            }}
          >
            {t('bulk_extend')}
          </Button>
          <Button
            size="sm"
            icon={<Database size={14} />}
            onClick={() => {
              setBulkAmount(10);
              setBulkPrompt('add_data');
            }}
          >
            {t('bulk_add_data')}
          </Button>
          <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => bulk('reset')}>
            {t('bulk_reset')}
          </Button>
          <Button size="sm" icon={<Link2 size={14} />} onClick={() => bulk('revoke')}>
            {t('bulk_revoke')}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => bulk('delete')}>
            {t('bulk_delete')}
          </Button>
        </div>
      )}

      {!data ? (
        <Card>
          <div class="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} class="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : empty ? (
        <Card>
          <Empty
            icon={<UsersIcon size={26} />}
            title={t('users_empty')}
            body={t('users_empty_body')}
            action={
              <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setFormOpen(true)}>
                {t('user_new')}
              </Button>
            }
          />
        </Card>
      ) : data.items.length === 0 ? (
        <Card>
          <Empty icon={<Search size={24} />} title={t('users_none_found')} />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div class="card hidden overflow-hidden md:block">
            <table class="w-full text-[13px]">
              <thead>
                <tr class="border-b border-line bg-surface-2 text-start text-[12px] text-muted">
                  <th class="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() =>
                        setSelected(allChecked ? new Set() : new Set(data.items.map((u) => u.id)))
                      }
                    />
                  </th>
                  <th class="px-3 py-3 text-start font-semibold">{t('col_user')}</th>
                  <th class="px-3 py-3 text-start font-semibold">{t('status')}</th>
                  <th class="px-3 py-3 text-start font-semibold">{t('col_usage')}</th>
                  <th class="px-3 py-3 text-start font-semibold">{t('col_expiry')}</th>
                  <th class="px-3 py-3 text-start font-semibold">{t('col_online')}</th>
                  <th class="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const exp = expiryText(u);
                  return (
                    <tr
                      key={u.id}
                      class={cx(
                        'cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-surface-2/70',
                        selected.has(u.id) && 'bg-brand/5',
                      )}
                      onClick={() => setDetail(u)}
                    >
                      <td class="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                      </td>
                      <td class="px-3 py-3">
                        <div class="font-bold">{u.name}</div>
                        {(u.tags.length > 0 || u.note) && (
                          <div class="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] text-muted">
                            {u.tags.map((tg) => (
                              <span key={tg} class="rounded-md bg-surface-2 px-1.5 py-px">
                                {tg}
                              </span>
                            ))}
                            {u.note && <span class="max-w-48 truncate">{u.note}</span>}
                          </div>
                        )}
                      </td>
                      <td class="px-3 py-3">
                        <Badge tone={STATUS_TONE[u.status]} dot>
                          {t(STATUS_KEY[u.status])}
                        </Badge>
                      </td>
                      <td class="w-52 px-3 py-3">
                        <div class="mb-1.5 flex justify-between gap-2 text-[12px]">
                          <span class="font-semibold">{fmtBytes(u.used)}</span>
                          <span class="text-muted">{u.dataLimit ? fmtBytes(u.dataLimit) : '∞'}</span>
                        </div>
                        {u.dataLimit > 0 && <Progress value={usagePercent(u)} />}
                      </td>
                      <td class="px-3 py-3">
                        <div class="font-semibold">{exp.main}</div>
                        {exp.sub && <div class="text-[11.5px] text-muted">{exp.sub}</div>}
                      </td>
                      <td class="px-3 py-3 text-muted">
                        {u.lastOnlineAt ? fmtRelative(u.lastOnlineAt) : '—'}
                      </td>
                      <td class="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div class="flex items-center justify-end gap-1">
                          <IconButton
                            label={t('copy')}
                            onClick={async () => {
                              if (await copyText(u.subUrl)) toast(t('copied'));
                            }}
                          >
                            <Link2 size={16} />
                          </IconButton>
                          <IconButton label="QR" onClick={() => setQrFor(u)}>
                            <QrIcon size={16} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div class="space-y-2.5 md:hidden">
            {data.items.map((u) => {
              const exp = expiryText(u);
              return (
                <div
                  key={u.id}
                  class={cx('card animate-pop p-4', selected.has(u.id) && 'ring-2 ring-brand/40')}
                >
                  <div class="flex items-start justify-between gap-3">
                    <label class="flex min-w-0 items-center gap-2.5">
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                      <button type="button" class="min-w-0 text-start" onClick={() => setDetail(u)}>
                        <div class="truncate text-[14.5px] font-bold">{u.name}</div>
                        <div class="text-[12px] text-muted">{exp.main}</div>
                      </button>
                    </label>
                    <Badge tone={STATUS_TONE[u.status]} dot>
                      {t(STATUS_KEY[u.status])}
                    </Badge>
                  </div>
                  <div class="mt-3">
                    <div class="mb-1.5 flex justify-between text-[12px]">
                      <span class="font-semibold">{fmtBytes(u.used)}</span>
                      <span class="text-muted">{u.dataLimit ? fmtBytes(u.dataLimit) : '∞'}</span>
                    </div>
                    {u.dataLimit > 0 && <Progress value={usagePercent(u)} />}
                  </div>
                  <div class="mt-3 flex items-center gap-2">
                    <CopyButton text={u.subUrl} variant="soft" />
                    <Button size="sm" icon={<QrIcon size={15} />} onClick={() => setQrFor(u)}>
                      QR
                    </Button>
                    <Button size="sm" variant="ghost" class="ms-auto" onClick={() => setDetail(u)}>
                      {t('details')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
            <div class="flex items-center gap-2">
              {t('per_page')}
              <Select
                class="!h-9 w-auto"
                value={String(size)}
                onChange={(e) => setSize(Number(e.currentTarget.value))}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {fmtNumber(n)}
                  </option>
                ))}
              </Select>
            </div>
            <div class="flex items-center gap-2">
              <IconButton label={t('back')} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <Prev size={18} />
              </IconButton>
              <span>{t('page_x_of_y', { x: page, y: pages })}</span>
              <IconButton label={t('next')} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                <Next size={18} />
              </IconButton>
            </div>
          </div>
        </>
      )}

      <UserForm
        open={formOpen}
        user={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(u) => {
          setFormOpen(false);
          if (editing) replace(u);
          else {
            load();
            setDetail(u);
          }
        }}
      />
      <UserDetail
        user={detail}
        onClose={() => setDetail(null)}
        onChanged={replace}
        onEdit={(u) => {
          setEditing(u);
          setFormOpen(true);
        }}
        onDeleted={() => {
          setDetail(null);
          load();
        }}
      />
      <BulkCreate open={batchOpen} onClose={() => setBatchOpen(false)} onDone={load} />

      <Modal open={!!qrFor} onClose={() => setQrFor(null)} title={qrFor?.name}>
        {qrFor && (
          <div class="flex flex-col items-center gap-4">
            <QrCode value={qrFor.subUrl} size={240} />
            <div class="ltr-num w-full break-all rounded-xl bg-surface-2 p-3 font-mono text-[12px]">
              {qrFor.subUrl}
            </div>
            <CopyButton text={qrFor.subUrl} variant="soft" />
          </div>
        )}
      </Modal>

      <Modal
        open={bulkPrompt !== null}
        onClose={() => setBulkPrompt(null)}
        title={bulkPrompt === 'extend' ? t('extend_title') : t('add_data_title')}
        footer={
          <Button
            variant="primary"
            onClick={() =>
              bulk(bulkPrompt!, bulkPrompt === 'extend' ? { days: bulkAmount } : { gb: bulkAmount })
            }
          >
            {t('confirm')}
          </Button>
        }
      >
        <div class="flex flex-wrap gap-1.5">
          {(bulkPrompt === 'extend' ? [7, 30, 60, 90, 180, 365] : [1, 5, 10, 20, 30, 50, 100]).map((n) => (
            <Chip key={n} active={bulkAmount === n} onClick={() => setBulkAmount(n)}>
              {fmtNumber(n)} {bulkPrompt === 'extend' ? t('days') : t('gb')}
            </Chip>
          ))}
        </div>
      </Modal>
    </>
  );
}
