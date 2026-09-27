import { Languages, Moon, Sun } from 'lucide-preact';
import { IconButton } from '../../common/components/ui';
import { lang, setLang, t } from '../../common/i18n';
import { theme, toggleTheme } from '../../common/theme';

/** Language + theme toggles, used in the top bar and on the auth screens. */
export function PrefToggles() {
  return (
    <div class="flex items-center gap-1">
      <IconButton label={t('language')} onClick={() => setLang(lang.value === 'fa' ? 'en' : 'fa')}>
        <span class="flex items-center gap-1 text-[12px] font-bold">
          <Languages size={16} />
          {lang.value === 'fa' ? 'EN' : 'فا'}
        </span>
      </IconButton>
      <IconButton label={theme.value === 'dark' ? t('theme_light') : t('theme_dark')} onClick={toggleTheme}>
        {theme.value === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </IconButton>
    </div>
  );
}
