// API shapes shared by the worker and the UI.
import type { ResetStrategy, UserStatus } from './constants';

export interface UserDto {
  id: number;
  name: string;
  status: UserStatus;
  uuid: string;
  trojanPassword: string;
  subToken: string;
  subUrl: string;
  dataLimit: number;
  usedUp: number;
  usedDown: number;
  used: number;
  lifetimeUsed: number;
  expireAt: number | null;
  durationDays: number | null;
  resetStrategy: ResetStrategy;
  lastResetAt: number;
  deviceLimit: number;
  allowedExits: string[];
  forceExit: boolean;
  operator: string | null;
  warpEnabled: boolean;
  filterExempt: boolean;
  note: string;
  tags: string[];
  disabledReason: string | null;
  planId: number | null;
  createdAt: number;
  updatedAt: number;
  firstUsedAt: number | null;
  lastOnlineAt: number | null;
  subUpdatedAt: number | null;
  subLastUa: string | null;
  rev: number;
}

export interface UserInput {
  name: string;
  dataLimit: number;
  /** Duration in days; 0 = unlimited. With onHold it starts at the first connection. */
  days?: number;
  /** Explicit expiry (ms). Overrides `days` when present; null = never. */
  expireAt?: number | null;
  onHold?: boolean;
  deviceLimit?: number;
  resetStrategy?: ResetStrategy;
  allowedExits?: string[];
  forceExit?: boolean;
  operator?: string | null;
  warpEnabled?: boolean;
  filterExempt?: boolean;
  note?: string;
  tags?: string[];
  planId?: number | null;
}

export interface UserListResponse {
  items: UserDto[];
  total: number;
  counts: Record<UserStatus | 'all', number>;
}

export interface PlanDto {
  id: number;
  name: string;
  dataLimit: number;
  durationDays: number;
  deviceLimit: number;
  allowedExits: string[];
  warpEnabled: boolean;
  resetStrategy: ResetStrategy;
  onHold: boolean;
  sort: number;
}

export type BulkAction = 'enable' | 'disable' | 'delete' | 'reset' | 'extend' | 'add_data' | 'revoke';

export interface OperatorConfigDto {
  /** Preferred ports for this ISP; empty = global ports. */
  ports?: number[];
  fingerprint?: string;
  fragment?: { enabled: boolean; packets?: string; length?: string; interval?: string };
}

export interface OperatorDto {
  code: string;
  nameFa: string;
  nameEn: string;
  asns: number[];
  enabled: boolean;
  sort: number;
  config: OperatorConfigDto;
  builtin: boolean;
  ips: { total: number; enabled: number; healthy: number };
}

export interface CleanIpDto {
  id: number;
  operator: string;
  address: string;
  port: number;
  label: string;
  enabled: boolean;
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: number | null;
}

/** Data behind the subscriber portal (`/<sub>/<token>/info`). */
export interface PortalData {
  brand: string;
  announcement: string;
  supportUrl: string;
  lang: 'fa' | 'en';
  user: {
    name: string;
    status: UserStatus;
    dataLimit: number;
    up: number;
    down: number;
    used: number;
    expireAt: number | null;
    durationDays: number | null;
    resetStrategy: ResetStrategy;
    createdAt: number;
    lastOnlineAt: number | null;
  };
  subUrl: string;
  formats: { b64: string; clash: string; singbox: string; xray: string };
  operator: {
    current: string | null;
    detected: string | null;
    saved: string | null;
    source: 'param' | 'saved' | 'asn' | 'default';
    list: { code: string; fa: string; en: string }[];
  };
  countries: { code: string; flag: string; fa: string; en: string }[];
  configs: { name: string; proto: 'vless' | 'trojan'; country: string | null; uri: string }[];
  fragment: boolean;
  now: number;
}
