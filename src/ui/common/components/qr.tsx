import { Check, Copy } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { ct as t } from '../lang';
import { qrPath } from '../qr';
import { toast } from './overlay';
import { Button, cx } from './ui';

/** QR code rendered locally as SVG (no third-party QR service ever sees the link). */
export function QrCode({ value, size = 220, class: cls }: { value: string; size?: number; class?: string }) {
  const q = useMemo(() => qrPath(value), [value]);
  return (
    <div class={cx('inline-block rounded-2xl bg-white p-3', cls)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${q.size} ${q.size}`}
        shape-rendering="crispEdges"
        role="img"
      >
        <path d={q.d} fill="#0b0d14" />
      </svg>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts / older WebViews.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({
  text,
  label,
  size = 'sm',
  variant = 'secondary',
}: {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'soft' | 'primary' | 'ghost';
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      icon={done ? <Check size={15} /> : <Copy size={15} />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          toast(t('copied'));
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {label ?? t('copy')}
    </Button>
  );
}
