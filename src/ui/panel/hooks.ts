import { useEffect, useState } from 'preact/hooks';
import type { SettingsGroup, SettingsMap } from '../../shared/settings';
import { ApiError, api } from '../common/api';
import { toast } from '../common/components/overlay';
import { t, tMaybe } from '../common/i18n';

/** Loads a settings group and saves it with optimistic concurrency. */
export function useSettings<K extends SettingsGroup>(group: K) {
  const [value, setValue] = useState<SettingsMap[K] | null>(null);
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api<{ value: SettingsMap[K]; version: number }>(`settings/${group}`)
      .then((r) => {
        setValue(r.value);
        setVersion(r.version);
      })
      .catch(() => toast(t('error_generic'), 'bad'));

  useEffect(() => {
    load();
  }, [group]);

  async function save(patch: Partial<SettingsMap[K]>): Promise<boolean> {
    setSaving(true);
    try {
      const r = await api<{ value: SettingsMap[K]; version: number }>(`settings/${group}`, 'PUT', {
        value: patch,
        version,
      });
      setValue(r.value);
      setVersion(r.version);
      toast(t('saved'));
      return true;
    } catch (err) {
      toast(tMaybe(`err_${err instanceof ApiError ? err.code : ''}`, t('error_generic')), 'bad');
      if (err instanceof ApiError && err.code === 'version_conflict') load();
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { value, setValue, save, saving, reload: load };
}
