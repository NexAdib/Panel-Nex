import type { FragmentSettings } from '../../shared/settings';
import type { SubNode } from './nodes';

export interface Cred {
  uuid: string;
  trojanPassword: string;
}

export interface FormatOptions {
  fingerprint: string;
  alpn: string;
  earlyData: number;
  fragment: FragmentSettings;
  rules: { iranDirect: boolean; blockQuic: boolean; blockAds: boolean; blockPorn: boolean };
  /** Client-side DNS (DoH) used by full-config formats. */
  dns: string;
}

/** Nodes that carry real traffic (info nodes excluded). */
export const realNodes = (nodes: SubNode[]): SubNode[] => nodes.filter((n) => !n.info);

/** Groups real nodes by their group label, preserving order. */
export function groupsOf(nodes: SubNode[]): { label: string; nodes: SubNode[] }[] {
  const map = new Map<string, SubNode[]>();
  for (const n of realNodes(nodes)) {
    const list = map.get(n.group) ?? [];
    list.push(n);
    map.set(n.group, list);
  }
  return [...map.entries()].map(([label, list]) => ({ label, nodes: list }));
}

export const MAIN_GROUP = '🚀 NexAdib';
export const TEST_URL = 'https://www.gstatic.com/generate_204';
