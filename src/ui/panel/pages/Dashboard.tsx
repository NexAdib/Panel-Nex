import { Cpu, MapPin } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../../common/api';
import { StatCard } from '../../common/components/ui';
import { t } from '../../common/i18n';
import { PageHeader } from '../components/page';
import { session } from '../state';

interface SystemInfo {
  version: string;
  colo: string | null;
  country: string | null;
  host: string;
}

export function DashboardPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    api<SystemInfo>('system/info')
      .then(setInfo)
      .catch(() => {});
  }, []);
  return (
    <>
      <PageHeader title={t('dash_welcome', { name: session.value ?? '' })} subtitle={t('dash_subtitle')} />
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('version')}
          value={<span class="ltr-num">{info?.version ?? '…'}</span>}
          icon={<Cpu size={20} />}
        />
        <StatCard
          label={t('location')}
          value={<span class="ltr-num">{info ? `${info.colo ?? '—'} · ${info.country ?? ''}` : '…'}</span>}
          icon={<MapPin size={20} />}
          tone="info"
        />
      </div>
    </>
  );
}
