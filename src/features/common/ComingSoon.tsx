import { Construction } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { EmptyState, PageHeader } from '@/components/ui';

/** Backend/ekran keyingi bosqichda ulanadigan bo'limlar uchun halol bo'sh holat. Statik raqam yo'q. */
export function ComingSoon({ titleKey }: { titleKey: string }) {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <div className="card">
        <EmptyState
          icon={<Construction />}
          title={t('common.coming_soon')}
          description={t('common.coming_soon_desc')}
        />
      </div>
    </>
  );
}
