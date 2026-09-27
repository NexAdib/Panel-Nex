import '../styles/app.css';
import { render } from 'preact';
import { applyLang } from '../common/i18n';
import { applyTheme } from '../common/theme';

applyTheme();
applyLang();

function Portal() {
  return <div class="grid min-h-dvh place-items-center text-muted">…</div>;
}

render(<Portal />, document.getElementById('app')!);
