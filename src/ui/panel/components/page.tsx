import type { ComponentChildren } from 'preact';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  actions?: ComponentChildren;
}) {
  return (
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-[22px] font-black tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p class="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div class="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
