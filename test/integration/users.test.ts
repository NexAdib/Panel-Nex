import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlanDto, UserDto, UserListResponse } from '../../src/shared/types';
import { type Installed, installAndLogin, startWorker, type TestWorker } from './harness';

const GB = 1024 ** 3;
const DAY = 86_400_000;

describe('users api', () => {
  let w: TestWorker;
  let inst: Installed;

  beforeAll(async () => {
    w = await startWorker();
    inst = await installAndLogin(w);
  });
  afterAll(async () => {
    await w.dispose();
  });

  it('creates a user with unique credentials and a sub link', async () => {
    const { status, data } = await inst.api<UserDto>('users', 'POST', {
      name: 'علی رضایی',
      dataLimit: 30 * GB,
      days: 30,
      deviceLimit: 2,
      tags: ['vip'],
    });
    expect(status).toBe(201);
    expect(data.status).toBe('active');
    expect(data.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.trojanPassword).toHaveLength(20);
    expect(data.subUrl).toBe(`https://panel.example.com/${inst.subPath}/${data.subToken}`);
    expect(data.expireAt! - Date.now()).toBeGreaterThan(29 * DAY);
    expect(data.tags).toEqual(['vip']);
  });

  it('rejects duplicate names case-insensitively', async () => {
    await inst.api('users', 'POST', { name: 'Sara' });
    const { status, data } = await inst.api('users', 'POST', { name: 'sara' });
    expect(status).toBe(409);
    expect(data).toMatchObject({ error: 'name_taken' });
  });

  it('supports on-hold users and unlimited plans', async () => {
    const onHold = await inst.api<UserDto>('users', 'POST', { name: 'hold', days: 60, onHold: true });
    expect(onHold.data).toMatchObject({ status: 'on_hold', expireAt: null, durationDays: 60 });
    const unlimited = await inst.api<UserDto>('users', 'POST', { name: 'forever', days: 0, dataLimit: 0 });
    expect(unlimited.data).toMatchObject({ status: 'active', expireAt: null, dataLimit: 0 });
  });

  it('batch-creates padded names atomically', async () => {
    const { status, data } = await inst.api<{ items: UserDto[] }>('users/batch-create', 'POST', {
      prefix: 'guest',
      start: 1,
      count: 12,
      template: { dataLimit: 10 * GB, days: 30 },
    });
    expect(status).toBe(201);
    expect(data.items.map((u) => u.name).slice(0, 2)).toEqual(['guest01', 'guest02']);
    const dup = await inst.api('users/batch-create', 'POST', {
      prefix: 'guest',
      start: 12,
      count: 2,
      template: {},
    });
    expect(dup.status).toBe(409);
    const list = await inst.api<UserListResponse>('users?q=guest&size=100');
    expect(list.data.total).toBe(12); // the failed batch inserted nothing
  });

  it('lists with counts, search, sort and paging', async () => {
    const { data } = await inst.api<UserListResponse>('users?size=5&page=2&sort=name&order=asc');
    expect(data.items).toHaveLength(5);
    expect(data.counts.all).toBe(data.total);
    expect(data.counts.on_hold).toBe(1);
    const q = await inst.api<UserListResponse>(`users?q=${encodeURIComponent('رضایی')}`);
    expect(q.data.items.map((u) => u.name)).toEqual(['علی رضایی']);
  });

  it('runs lifecycle actions and keeps status consistent', async () => {
    const created = await inst.api<UserDto>('users', 'POST', { name: 'cycle', dataLimit: GB, days: 10 });
    const id = created.data.id;
    const disabled = await inst.api<UserDto>(`users/${id}/disable`, 'POST', {});
    expect(disabled.data.status).toBe('disabled');
    const enabled = await inst.api<UserDto>(`users/${id}/enable`, 'POST', {});
    expect(enabled.data.status).toBe('active');
    const ext = await inst.api<UserDto>(`users/${id}/extend`, 'POST', { days: 5 });
    expect(ext.data.expireAt! - created.data.expireAt!).toBeGreaterThanOrEqual(5 * DAY - 1000);
    const more = await inst.api<UserDto>(`users/${id}/add-data`, 'POST', { gb: 2 });
    expect(more.data.dataLimit).toBe(3 * GB);
    const revoked = await inst.api<UserDto>(`users/${id}/revoke`, 'POST', {});
    expect(revoked.data.subToken).not.toBe(created.data.subToken);
    expect(revoked.data.uuid).toBe(created.data.uuid);
    const regen = await inst.api<UserDto>(`users/${id}/regenerate`, 'POST', {});
    expect(regen.data.uuid).not.toBe(created.data.uuid);
    // expire in the past → expired; extending brings it back
    const past = await inst.api<UserDto>(`users/${id}`, 'PATCH', { expireAt: Date.now() - 1000 });
    expect(past.data.status).toBe('expired');
    const back = await inst.api<UserDto>(`users/${id}/extend`, 'POST', { days: 1 });
    expect(back.data.status).toBe('active');
  });

  it('enforces optimistic concurrency on PATCH', async () => {
    const u = await inst.api<UserDto>('users', 'POST', { name: 'rev-test' });
    const ok = await inst.api<UserDto>(`users/${u.data.id}`, 'PATCH', { note: 'a', rev: u.data.rev });
    expect(ok.status).toBe(200);
    const stale = await inst.api(`users/${u.data.id}`, 'PATCH', { note: 'b', rev: u.data.rev });
    expect(stale.status).toBe(409);
  });

  it('applies bulk actions', async () => {
    const list = await inst.api<UserListResponse>('users?q=guest&size=100');
    const ids = list.data.items.map((u) => u.id);
    expect((await inst.api('users-bulk', 'POST', { ids, action: 'disable' })).status).toBe(200);
    let after = await inst.api<UserListResponse>('users?q=guest&size=100&status=disabled');
    expect(after.data.total).toBe(12);
    await inst.api('users-bulk', 'POST', { ids, action: 'enable' });
    await inst.api('users-bulk', 'POST', { ids: ids.slice(0, 2), action: 'delete' });
    after = await inst.api<UserListResponse>('users?q=guest&size=100');
    expect(after.data.total).toBe(10);
    expect(after.data.items.every((u) => u.status === 'active')).toBe(true);
  });

  it('exports CSV', async () => {
    const res = await w.fetch(`${inst.panel}api/users-export.csv`, { cookie: inst.cookie });
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text.split('\n')[0]).toContain('sub_url');
    expect(text).toContain('علی رضایی');
  });

  it('manages plans', async () => {
    const list = await inst.api<{ items: PlanDto[] }>('plans');
    expect(list.data.items.length).toBeGreaterThanOrEqual(4);
    const created = await inst.api<PlanDto>('plans', 'POST', {
      name: 'Gold',
      dataLimit: 200 * GB,
      durationDays: 90,
    });
    expect(created.status).toBe(201);
    const upd = await inst.api<PlanDto>(`plans/${created.data.id}`, 'PATCH', { deviceLimit: 3 });
    expect(upd.data).toMatchObject({ name: 'Gold', deviceLimit: 3, durationDays: 90 });
    expect((await inst.api(`plans/${created.data.id}`, 'DELETE')).status).toBe(200);
  });
});
