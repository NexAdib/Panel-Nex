import { CircleCheck, KeyRound } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { CopyButton } from '../../common/components/qr';
import { Button, Field, Input, Spinner } from '../../common/components/ui';
import { lang, t, tMaybe } from '../../common/i18n';
import { AuthShell } from '../components/auth-shell';

interface Status {
  installed: boolean;
  needsToken: boolean;
}

export function InstallPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ username: '', password: '', repeat: '', token: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelUrl, setPanelUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('api/install/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setError(t('error_network')));
  }, []);

  const set = (k: keyof typeof form) => (e: Event) =>
    setForm({ ...form, [k]: (e.target as HTMLInputElement).value });

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.repeat) return setError(t('err_password_mismatch'));
    setBusy(true);
    try {
      const res = await fetch('api/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nexadib': '1' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          setupToken: form.token || undefined,
          language: lang.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setPanelUrl(location.origin + data.panelPath);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error';
      setError(tMaybe(`err_${code}`, t('error_generic')));
    } finally {
      setBusy(false);
    }
  }

  if (panelUrl) {
    return (
      <AuthShell>
        <div class="card animate-pop p-6 text-center">
          <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ok/12 text-ok">
            <CircleCheck size={28} />
          </div>
          <h1 class="text-xl font-black">{t('install_done_title')}</h1>
          <p class="mt-2 text-[13px] text-muted">{t('install_done_body')}</p>
          <div class="ltr-num mt-4 break-all rounded-xl border border-line bg-surface-2 p-3 font-mono text-[13px]">
            {panelUrl}
          </div>
          <div class="mt-4 flex justify-center gap-2">
            <CopyButton text={panelUrl} />
            <Button variant="primary" onClick={() => location.assign(panelUrl)}>
              {t('install_open_panel')}
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form class="card animate-pop space-y-4 p-6" onSubmit={submit}>
        <div>
          <h1 class="text-xl font-black">{t('install_title')}</h1>
          <p class="mt-1.5 text-[13px] text-muted">{t('install_subtitle')}</p>
        </div>
        {!status ? (
          <div class="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        ) : (
          <>
            <Field label={t('username')}>
              <Input ltr autoComplete="username" value={form.username} onInput={set('username')} required />
            </Field>
            <Field label={t('password')} hint={t('password_hint')}>
              <Input
                ltr
                type="password"
                autoComplete="new-password"
                value={form.password}
                onInput={set('password')}
                required
              />
            </Field>
            <Field label={t('password_repeat')}>
              <Input
                ltr
                type="password"
                autoComplete="new-password"
                value={form.repeat}
                onInput={set('repeat')}
                required
              />
            </Field>
            {status.needsToken && (
              <Field label={t('install_token')} hint={t('install_token_hint')}>
                <Input ltr value={form.token} onInput={set('token')} required />
              </Field>
            )}
            {error && <p class="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={busy}
              icon={<KeyRound size={18} />}
            >
              {t('install_button')}
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
