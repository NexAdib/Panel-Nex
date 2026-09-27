import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type BtnSize = 'sm' | 'md' | 'lg';

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    'grad-brand text-brand-fg shadow-[0_6px_20px_-6px_var(--brand)] hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface-2 text-fg border border-line hover:border-line-2 hover:bg-bg-2',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'bg-bad/10 text-bad border border-bad/25 hover:bg-bad/15',
  soft: 'bg-brand/12 text-brand hover:bg-brand/18',
};
const BTN_SIZE: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
};

export function Button(
  props: JSX.HTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: BtnSize;
    loading?: boolean;
    icon?: ComponentChildren;
    block?: boolean;
    type?: 'button' | 'submit';
    disabled?: boolean;
  },
) {
  const {
    variant = 'secondary',
    size = 'md',
    loading,
    icon,
    block,
    children,
    class: cls,
    disabled,
    ...rest
  } = props;
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      class={cx(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        block && 'w-full',
        cls as string,
      )}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
}

export function IconButton(
  props: JSX.HTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; disabled?: boolean },
) {
  const { label, active, children, class: cls, ...rest } = props;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      class={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl text-fg-2 transition-colors',
        'hover:bg-surface-2 hover:text-fg disabled:opacity-50',
        active && 'bg-surface-2 text-fg',
        cls as string,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" class="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
  );
}

const INPUT_BASE =
  'w-full rounded-xl border border-line bg-surface-2 px-3.5 text-fg placeholder:text-muted transition-colors ' +
  'focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60';

export function Input(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & { ltr?: boolean; invalid?: boolean },
) {
  const { ltr, invalid, class: cls, dir, ...rest } = props;
  return (
    <input
      {...rest}
      class={cx(INPUT_BASE, 'h-11', ltr && 'ltr-num text-left', invalid && 'border-bad', cls as string)}
      dir={ltr ? 'ltr' : dir}
    />
  );
}

export function Textarea(props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & { ltr?: boolean }) {
  const { ltr, class: cls, ...rest } = props;
  return (
    <textarea
      {...rest}
      class={cx(
        INPUT_BASE,
        'min-h-24 py-2.5',
        ltr && 'ltr-num text-left font-mono text-[13px]',
        cls as string,
      )}
      dir={ltr ? 'ltr' : undefined}
    />
  );
}

export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  const { class: cls, children, ...rest } = props;
  return (
    <select {...rest} class={cx(INPUT_BASE, 'h-11 appearance-none pe-9', cls as string)}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  class: cls,
}: {
  label?: ComponentChildren;
  hint?: ComponentChildren;
  error?: string | null;
  children: ComponentChildren;
  class?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the form control is passed in as children
    <label class={cx('block', cls)}>
      {label && <span class="mb-1.5 block text-[13px] font-semibold text-fg-2">{label}</span>}
      {children}
      {error ? (
        <span class="mt-1.5 block text-[12px] text-bad">{error}</span>
      ) : hint ? (
        <span class="mt-1.5 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ComponentChildren;
  description?: ComponentChildren;
  disabled?: boolean;
}) {
  const id = useId();
  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      class={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'grad-brand' : 'bg-line-2',
        disabled && 'opacity-50',
      )}
    >
      <span
        class={cx(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-[22px] rtl:-translate-x-[22px]' : 'translate-x-0.5 rtl:-translate-x-0.5',
        )}
      />
    </button>
  );
  if (!label) return toggle;
  return (
    <div class="flex items-start justify-between gap-4 py-2">
      <label for={id} class="min-w-0 cursor-pointer">
        <span class="block text-sm font-semibold text-fg">{label}</span>
        {description && <span class="mt-0.5 block text-[12.5px] text-muted">{description}</span>}
      </label>
      {toggle}
    </div>
  );
}

export function Card({
  children,
  class: cls,
  title,
  actions,
  padded = true,
}: {
  children: ComponentChildren;
  class?: string;
  title?: ComponentChildren;
  actions?: ComponentChildren;
  padded?: boolean;
}) {
  return (
    <section class={cx('card animate-pop', cls)}>
      {(title || actions) && (
        <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h3 class="text-[15px] font-bold">{title}</h3>
          <div class="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div class={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'brand';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok/12 text-ok',
  warn: 'bg-warn/14 text-warn',
  bad: 'bg-bad/12 text-bad',
  info: 'bg-info/12 text-info',
  muted: 'bg-surface-2 text-muted border border-line',
  brand: 'bg-brand/12 text-brand',
};

export function Badge({
  tone = 'muted',
  children,
  dot,
}: {
  tone?: Tone;
  children: ComponentChildren;
  dot?: boolean;
}) {
  return (
    <span
      class={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
        TONE[tone],
      )}
    >
      {dot && <span class="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Progress({ value, tone }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const auto: Tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok';
  const bar = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    bad: 'bg-bad',
    info: 'bg-info',
    muted: 'bg-muted',
    brand: 'grad-brand',
  }[tone ?? auto];
  return (
    <div class="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div class={cx('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({
  value,
  size = 120,
  stroke = 10,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ComponentChildren;
}) {
  const gid = `nxr${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div class="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} class="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--brand)" />
            <stop offset="100%" stop-color="var(--brand-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" stroke-width={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div class="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ComponentChildren }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          class={cx(
            'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
            o.value === value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ class: cls }: { class?: string }) {
  return <div class={cx('skeleton', cls ?? 'h-4 w-full')} />;
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ComponentChildren;
  title: ComponentChildren;
  body?: ComponentChildren;
  action?: ComponentChildren;
}) {
  return (
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div class="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">{icon}</div>}
      <h4 class="text-base font-bold">{title}</h4>
      {body && <p class="max-w-sm text-[13px] text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'brand',
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  sub?: ComponentChildren;
  icon?: ComponentChildren;
  tone?: Tone;
}) {
  return (
    <div class="card animate-pop relative overflow-hidden p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[12.5px] font-semibold text-muted">{label}</div>
          <div class="mt-1.5 truncate text-xl font-extrabold tracking-tight sm:text-2xl">{value}</div>
          {sub && <div class="mt-1 text-[12px] text-muted">{sub}</div>}
        </div>
        {icon && (
          <div class={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TONE[tone])}>{icon}</div>
        )}
      </div>
    </div>
  );
}
