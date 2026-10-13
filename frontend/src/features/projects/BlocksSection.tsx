import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button, EmptyState, SearchInput, Segmented } from '@/components/ui';
import { BlockModal, ZoneStatusBadge, responsiblesText, useImageSrc } from './blocks';
import { zoneStatuses, type ProjectDetail, type Zone, type ZoneStatus } from './types';

function BlockCard({ projectId, zone }: { projectId: string; zone: Zone }) {
  const { t } = useT();
  const image = useImageSrc(zone.image_file_id);
  return (
    <Link to={`/app/projects/${projectId}/blocks/${zone.id}`} className="block-card">
      <div className="block-card-media">{image ? <img src={image} alt="" /> : <Building2 aria-hidden />}</div>
      <div className="block-card-head">
        <h3>
          {t('blocks.block_label')} <b>{zone.name}</b>
        </h3>
        <ZoneStatusBadge status={zone.status} />
      </div>
      <p>
        {t('projects.zone_floors')}: {zone.floors_count ?? '—'}
      </p>
      <p>
        {t('blocks.responsible')}: {responsiblesText(zone)}
      </p>
    </Link>
  );
}

/** Obyekt sahifasining bloklar qismi (Figma "obyekt ko'rish"): qidiruv, holat filtri va blok kartalari. */
export function BlocksSection({
  d,
  canEdit,
  onChange,
}: {
  d: ProjectDetail;
  canEdit: boolean;
  onChange: () => Promise<unknown>;
}) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | ZoneStatus>('all');
  const [creating, setCreating] = useState(false);
  const blocks = d.zones.filter((z) => z.kind === 'block');
  const needle = search.trim().toLocaleLowerCase();
  const shown = blocks.filter(
    (z) =>
      (status === 'all' || z.status === status) && (!needle || z.name.toLocaleLowerCase().includes(needle)),
  );
  const createButton = canEdit ? (
    <Button icon={<Plus />} onClick={() => setCreating(true)}>
      {t('blocks.new')}
    </Button>
  ) : undefined;
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="toolbar blocks-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder={t('blocks.search')} />
        <Segmented<'all' | ZoneStatus>
          value={status}
          onChange={setStatus}
          items={[
            { key: 'all', label: t('blocks.filter_all') },
            ...zoneStatuses.map((s) => ({ key: s, label: t(`blocks.status.${s}`) })),
          ]}
        />
        <span className="spacer" />
        {createButton}
      </div>
      {shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Building2 />}
            title={blocks.length === 0 ? t('blocks.empty') : t('blocks.empty_filtered')}
            description={blocks.length === 0 && canEdit ? t('blocks.empty_desc') : undefined}
            action={blocks.length === 0 ? createButton : undefined}
          />
        </div>
      ) : (
        <div className="block-grid">
          {shown.map((z) => (
            <BlockCard key={z.id} projectId={d.id} zone={z} />
          ))}
        </div>
      )}
      {creating && <BlockModal d={d} zone={null} onClose={() => setCreating(false)} onDone={onChange} />}
    </section>
  );
}
