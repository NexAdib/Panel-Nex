import { LogIn } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { ApiError, api } from '../../common/api';
import { Button, Field, Input } from '../../common/components/ui';
import { t } from '../../common/i18n';
import { AuthShell } from '../components/auth-shell';

export function LoginPage({ onLoggedIn }: { onLoggedIn: (username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ username: string }>('auth/login', 'POST', {
        username,
        password,
        ...(needOtp ? (useRecovery ? { recovery: code } : { otp: code }) : {}),
      });
      onLoggedIn(res.username);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'otp_required') {
          setNeedOtp(true);
          setError(null);
        } else if (err.code === 'locked')
          setError(t('err_locked', { sec: Number(err.data.retryAfter ?? 60) }));
        else if (err.code === 'invalid_otp') setError(t('err_invalid_otp'));
        else if (err.code === 'invalid_credentials') setError(t('err_invalid_credentials'));
        else if (err.code === 'network') setError(t('error_network'));
        else setError(t('error_generic'));
      } else setError(t('error_generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form class="card animate-pop space-y-4 p-6" onSubmit={submit}>
        <div>
          <h1 class="text-xl font-black">{t('login_title')}</h1>
          <p class="mt-1.5 text-[13px] text-muted">{t('login_subtitle')}</p>
        </div>
        <Field label={t('username')}>
          <Input
            ltr
            autoComplete="username"
            value={username}
            onInput={(e) => setUsername(e.currentTarget.value)}
            required
          />
        </Field>
        <Field label={t('password')}>
          <Input
            ltr
            type="password"
            autoComplete="current-password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </Field>
        {needOtp && (
          <Field
            label={useRecovery ? t('recovery_code') : t('otp_code')}
            hint={useRecovery ? undefined : t('otp_required_hint')}
          >
            <Input
              ltr
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              value={code}
              onInput={(e) => setCode(e.currentTarget.value)}
              required
            />
            <button
              type="button"
              class="mt-2 text-[12.5px] font-semibold text-brand hover:underline"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode('');
              }}
            >
              {useRecovery ? t('use_otp') : t('use_recovery')}
            </button>
          </Field>
        )}
        {error && <p class="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<LogIn size={18} />}>
          {busy ? t('signing_in') : t('sign_in')}
        </Button>
      </form>
    </AuthShell>
  );
}
