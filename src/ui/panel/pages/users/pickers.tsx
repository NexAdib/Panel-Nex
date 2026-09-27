import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  DATA_PRESETS_GB,
  DEVICE_PRESETS,
  DURATION_PRESETS_DAYS,
  flagEmoji,
  GB,
} from '../../../../shared/constants';
import { api } from '../../../common/api';
import { cx } from '../../../common/components/ui';
import { fmtNumber } from '../../../common/format';
import { lang, t } from '../../../common/i18n';
import { durationLabel } from './labels';

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={cx(
        'shrink-0 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-all',
        active
          ? 'border-transparent grad-brand text-brand-fg shadow-[0_4px_14px_-6px_var(--brand)]'
          : 'border-line bg-surface-2 text-fg-2 hover:border-line-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function NumberBox({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder: string;
  suffix: string;
}) {
  return (
    <div class="flex h-9 items-center overflow-hidden rounded-xl border border-line bg-surface-2 focus-within:border-brand">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        dir="ltr"
        class="h-full w-24 bg-transparent px-3 text-[13px] outline-none"
        placeholder={placeholder}
        value={value}
        onInput={(e) => {
          const v = e.currentTarget.value;
          onChange(v === '' ? '' : Math.max(0, Number(v)));
        }}
      />
      <span class="border-s border-line px-2.5 text-[12px] text-muted">{suffix}</span>
    </div>
  );
}

/** Data limit in bytes; 0 = unlimited. */
export function DataLimitPicker({ value, onChange }: { value: number; onChange: (bytes: number) => void }) {
  const gb = value / GB;
  const isPreset = (DATA_PRESETS_GB as readonly number[]).includes(Math.round(gb * 1000) / 1000);
  return (
    <div class="space-y-2.5">
      <div class="-mx-1 flex flex-wrap gap-1.5 px-1">
        {DATA_PRESETS_GB.map((p) => (
          <Chip key={p} active={isPreset && gb === p} onClick={() => onChange(p * GB)}>
            {p === 0 ? `∞ ${t('unlimited')}` : `${fmtNumber(p)} ${t('gb')}`}
          </Chip>
        ))}
      </div>
      <NumberBox
        value={isPreset ? '' : Number(gb.toFixed(2))}
        placeholder={t('f_custom_gb')}
        suffix={t('gb')}
        onChange={(v) => onChange(v === '' ? 0 : Math.round(v * GB))}
      />
    </div>
  );
}

export function DurationPicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const isPreset = (DURATION_PRESETS_DAYS as readonly number[]).includes(value);
  return (
    <div class="space-y-2.5">
      <div class="flex flex-wrap gap-1.5">
        {DURATION_PRESETS_DAYS.map((d) => (
          <Chip key={d} active={isPreset && value === d} onClick={() => onChange(d)}>
            {d === 0 ? `∞ ${t('unlimited')}` : durationLabel(d)}
          </Chip>
        ))}
      </div>
      <NumberBox
        value={isPreset ? '' : value}
        placeholder={t('f_custom_days')}
        suffix={t('days')}
        onChange={(v) => onChange(v === '' ? 30 : Math.round(v))}
      />
    </div>
  );
}

export function DevicePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div class="flex flex-wrap gap-1.5">
      {DEVICE_PRESETS.map((d) => (
        <Chip key={d} active={value === d} onClick={() => onChange(d)}>
          {d === 0 ? `∞ ${t('unlimited')}` : fmtNumber(d)}
        </Chip>
      ))}
    </div>
  );
}

let exitCountriesCache: string[] | null = null;

export function useExitCountries(): string[] {
  const [list, setList] = useState<string[]>(exitCountriesCache ?? []);
  useEffect(() => {
    if (exitCountriesCache) return;
    api<{ value: { countries: string[] } }>('settings/exits')
      .then((r) => {
        exitCountriesCache = r.value.countries;
        setList(r.value.countries);
      })
      .catch(() => {});
  }, []);
  return list;
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames([lang.value === 'fa' ? 'fa' : 'en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Multi-select of exit countries. ["*"] means all. */
export function ExitsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const countries = useExitCountries();
  const all = value.includes('*');
  const toggle = (c: string) => {
    const set = new Set(all ? countries : value);
    if (set.has(c)) set.delete(c);
    else set.add(c);
    const next = [...set];
    onChange(next.length === countries.length ? ['*'] : next);
  };
  return (
    <div class="flex flex-wrap gap-1.5">
      <Chip active={all} onClick={() => onChange(['*'])}>
        🌍 {t('f_exits_all')}
      </Chip>
      {countries.map((c) => (
        <Chip key={c} active={!all && value.includes(c)} onClick={() => toggle(c)}>
          {flagEmoji(c)} {countryName(c)}
        </Chip>
      ))}
    </div>
  );
}
