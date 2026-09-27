import { Sparkles } from 'lucide-preact';
import { Card, Empty } from '../../common/components/ui';
import { t } from '../../common/i18n';

export function ComingSoon() {
  return (
    <Card>
      <Empty icon={<Sparkles size={26} />} title={t('coming_soon')} />
    </Card>
  );
}
