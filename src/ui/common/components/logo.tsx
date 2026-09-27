import { useId } from 'preact/hooks';

export function LogoMark({ size = 34 }: { size?: number }) {
  // Unique gradient id per instance: a hidden duplicate would otherwise break the fill.
  const gid = `nxl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--brand)" />
          <stop offset="1" stop-color="var(--brand-2)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="var(--surface-2)" stroke="var(--line)" />
      <path d="M18 46V18h6l16 18V18h6v28h-6L24 28v18z" fill={`url(#${gid})`} />
      <circle cx="49" cy="15" r="4" fill="var(--ok)" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div class="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <div class="leading-tight">
          <div class="text-[17px] font-black tracking-tight" dir="ltr">
            Nex<span class="text-grad">Adib</span>
          </div>
        </div>
      )}
    </div>
  );
}
