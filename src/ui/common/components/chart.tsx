// Small dependency-free SVG charts (daily traffic bars, status donut).
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fmtBytes } from '../format';
import { lang } from '../lang';
import { cx } from './ui';

export interface BarPoint {
  day: string; // YYYY-MM-DD
  up: number;
  down: number;
}

function dayLabel(day: string, withMonth = true): string {
  const d = new Date(`${day}T12:00:00Z`);
  const loc = lang.value === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB';
  return new Intl.DateTimeFormat(
    loc,
    withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' },
  ).format(d);
}

/** Rounds a max value up to a "nice" axis limit. */
function niceMax(v: number): number {
  if (v <= 0) return 1024 ** 3;
  const exp = 1024 ** Math.floor(Math.log(v) / Math.log(1024));
  const n = v / exp;
  const steps = [1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 64, 80, 100, 128, 200, 256, 400, 512, 800, 1024];
  return (steps.find((s) => s >= n) ?? 1024) * exp;
}

export function TrafficBars({ data, height = 220 }: { data: BarPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  // Draw at the real pixel width so labels keep their size on phones.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const padL = 56;
  const padB = 26;
  const padT = 10;
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.up + d.down))), [data]);
  const n = data.length || 1;
  const slot = (W - padL - 8) / n;
  const bw = Math.max(3, Math.min(18, slot * 0.62));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(W / 110)));
  const cur = hover !== null ? data[hover] : null;

  return (
    <div class="relative" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} class="h-auto w-full" role="img" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="nx-bar-down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--brand-2)" />
            <stop offset="1" stop-color="var(--brand)" />
          </linearGradient>
        </defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line
              x1={padL}
              x2={W - 4}
              y1={y(max * tk)}
              y2={y(max * tk)}
              stroke="var(--line)"
              stroke-dasharray={tk ? '3 4' : ''}
            />
            <text x={padL - 8} y={y(max * tk) + 4} text-anchor="end" font-size="11" fill="var(--muted)">
              {fmtBytes(max * tk, 0)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const yDown = y(d.down);
          const yTop = y(d.up + d.down);
          const active = hover === i;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {d.down > 0 && (
                <rect
                  x={x}
                  y={yDown}
                  width={bw}
                  height={Math.max(0, H - padB - yDown)}
                  rx={Math.min(3, bw / 3)}
                  fill="url(#nx-bar-down)"
                  opacity={hover === null || active ? 1 : 0.55}
                />
              )}
              {d.up > 0 && (
                <rect
                  x={x}
                  y={yTop}
                  width={bw}
                  height={Math.max(1, yDown - yTop)}
                  rx={Math.min(3, bw / 3)}
                  fill="var(--info)"
                  opacity={hover === null || active ? 0.9 : 0.45}
                />
              )}
              {(i % labelEvery === 0 || i === n - 1) && (
                <text
                  x={padL + i * slot + slot / 2}
                  y={H - 8}
                  text-anchor="middle"
                  font-size="11"
                  fill="var(--muted)"
                >
                  {dayLabel(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {cur && hover !== null && (
        <div
          class="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-card"
          style={{
            left: `${Math.min(80, Math.max(8, ((padL + hover * slot) / W) * 100))}%`,
            transform: 'translateX(-50%)',
          }}
          dir={lang.value === 'fa' ? 'rtl' : 'ltr'}
        >
          <div class="mb-1 font-bold">{dayLabel(cur.day)}</div>
          <div class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-1.5 text-muted">
              <i class="inline-block h-2 w-2 rounded-full bg-[var(--brand)]" />↓
            </span>
            <span class="font-semibold">{fmtBytes(cur.down)}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-1.5 text-muted">
              <i class="inline-block h-2 w-2 rounded-full bg-[var(--info)]" />↑
            </span>
            <span class="font-semibold">{fmtBytes(cur.up)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export interface DonutPart {
  key: string;
  value: number;
  color: string;
  label: ComponentChildren;
}

export function Donut({
  parts,
  size = 150,
  stroke = 18,
  center,
}: {
  parts: DonutPart[];
  size?: number;
  stroke?: number;
  center?: ComponentChildren;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div class="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} class="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" stroke-width={stroke} />
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => {
              const len = (p.value / total) * c;
              const el = (
                <circle
                  key={p.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={p.color}
                  stroke-width={stroke}
                  stroke-dasharray={`${Math.max(0, len - 2)} ${c}`}
                  stroke-dashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
      </svg>
      <div class="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  );
}

export function Legend({ parts, onPick }: { parts: DonutPart[]; onPick?: (key: string) => void }) {
  return (
    <div class="space-y-1.5">
      {parts.map((p) => (
        <button
          type="button"
          key={p.key}
          onClick={() => onPick?.(p.key)}
          class={cx(
            'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-[13px]',
            onPick && 'hover:bg-surface-2',
          )}
        >
          <span class="flex items-center gap-2 text-fg-2">
            <i class="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            {p.label}
          </span>
          <span class="font-bold">{p.value.toLocaleString(lang.value === 'fa' ? 'fa-IR' : 'en-US')}</span>
        </button>
      ))}
    </div>
  );
}
