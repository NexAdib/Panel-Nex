import { signal } from '@preact/signals';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ct as t } from '../lang';
import { Button, cx } from './ui';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  useEscape(open, onClose);
  useBodyLock(open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t('close')}
        class="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={ref}
        class={cx(
          'card animate-pop relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-xl2',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h3 class="text-base font-bold">{title}</h3>
          <button
            type="button"
            class="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div class="overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  useEscape(open, onClose);
  useBodyLock(open);
  if (!open) return null;
  return (
    <div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label={t('close')} class="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside class="relative z-10 flex h-full w-full max-w-xl flex-col border-s border-line bg-surface shadow-card animate-pop">
        <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h3 class="text-base font-bold">{title}</h3>
          <button
            type="button"
            class="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

// ---- toasts ----------------------------------------------------------------

type ToastKind = 'ok' | 'bad' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}
const toasts = signal<ToastItem[]>([]);
let seq = 0;

export function toast(text: string, kind: ToastKind = 'ok', ms = 3200): void {
  const id = ++seq;
  toasts.value = [...toasts.value, { id, kind, text }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }, ms);
}

export function Toasts() {
  return (
    <div class="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {toasts.value.map((x) => (
        <div
          key={x.id}
          class="card glass animate-pop pointer-events-auto flex max-w-md items-center gap-2.5 px-4 py-3 text-sm font-semibold"
        >
          {x.kind === 'ok' ? (
            <CircleCheck size={18} class="text-ok" />
          ) : x.kind === 'bad' ? (
            <CircleAlert size={18} class="text-bad" />
          ) : (
            <Info size={18} class="text-info" />
          )}
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---- confirm dialog (promise based) -------------------------------------------

interface ConfirmState {
  title: string;
  body?: string;
  danger?: boolean;
  confirmText?: string;
  resolve: (v: boolean) => void;
}
const confirmState = signal<ConfirmState | null>(null);

export function confirmDialog(opts: Omit<ConfirmState, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.value = { ...opts, resolve };
  });
}

export function ConfirmHost() {
  const s = confirmState.value;
  const done = (v: boolean) => {
    s?.resolve(v);
    confirmState.value = null;
  };
  return (
    <Modal
      open={!!s}
      onClose={() => done(false)}
      title={s?.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            {t('cancel')}
          </Button>
          <Button variant={s?.danger ? 'danger' : 'primary'} onClick={() => done(true)}>
            {s?.confirmText ?? t('confirm')}
          </Button>
        </>
      }
    >
      <p class="text-sm leading-7 text-fg-2">{s?.body}</p>
    </Modal>
  );
}
