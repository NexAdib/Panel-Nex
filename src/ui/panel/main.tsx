import '../styles/app.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, unauthorized } from '../common/api';
import { Spinner } from '../common/components/ui';
import { applyLang, lang } from '../common/i18n';
import { applyTheme, theme } from '../common/theme';
import { App } from './App';
import { InstallPage } from './pages/Install';
import { LoginPage } from './pages/Login';
import { session } from './state';

applyTheme();
applyLang();

function Root() {
  // Re-render on language/theme change.
  void lang.value;
  void theme.value;
  const installMode = location.pathname === '/install' || location.pathname === '/install/';
  const [checked, setChecked] = useState(installMode);

  useEffect(() => {
    if (installMode) return;
    api<{ authenticated: boolean; username: string | null }>('auth/status')
      .then((s) => {
        session.value = s.authenticated ? s.username : null;
      })
      .catch(() => {
        session.value = null;
      })
      .finally(() => setChecked(true));
  }, []);

  if (installMode) return <InstallPage />;
  if (!checked) {
    return (
      <div class="grid min-h-dvh place-items-center text-muted">
        <Spinner size={28} />
      </div>
    );
  }
  if (!session.value || unauthorized.value) {
    return (
      <LoginPage
        onLoggedIn={(u) => {
          unauthorized.value = false;
          session.value = u;
        }}
      />
    );
  }
  return <App username={session.value} onLogout={() => (session.value = null)} />;
}

render(<Root />, document.getElementById('app')!);
