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
