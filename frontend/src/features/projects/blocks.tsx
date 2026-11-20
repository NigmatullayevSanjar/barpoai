import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { api, ApiError, randomId } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { readAsBase64, useFileContent } from '@/features/work/model';
import { checkDates, projectSchema } from './ProjectsPage';
import type { ProjectDetail, Zone, ZoneStatus } from './types';

/** Qavatlar soni: bo'sh yoki 1..500 butun son (serverdagi zoneFloors bilan bir xil). */
const FLOORS_RE = /^(?:[1-9]\d{0,2}|500)$/;
/**
 * Server sanani to'liq ISO ("2026-10-12T00:00:00.000Z": pg date → JS Date) yoki "YYYY-MM-DD" ko'rinishida beradi;
 * sana maydoni ikkinchisini kutadi. Vaqt qismi bo'lsa kun formatDate bilan bir xil (Toshkent) mintaqada olinadi:
 * server qaysi mintaqada ishlamasin, tahrir oynasi ko'rsatilgan sanani qaytaradi va saqlashda sana siljimaydi.
 */
export const dateInput = (v: string | null) => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
};
export const responsiblesText = (z: Zone) => z.responsibles.map((r) => r.display_name).join(', ') || '—';

/** Holat serverda sanalardan hisoblanadi; bu yerda faqat ko'rinish (kontur + matn, rang yolg'iz belgi emas). */
export function ZoneStatusBadge({ status }: { status: ZoneStatus }) {
  const { t } = useT();
  return <span className={`zone-status zone-status-${status}`}>{t(`blocks.status.${status}`)}</span>;
}

/** Fayl mazmuni data URL sifatida; `files` o'qish huquqi yo'q yoki fayl yuklanmagan bo'lsa null. */
export function useImageSrc(id: string | null) {
  const { can } = useAuth();
  const content = useFileContent(id && can('files') ? id : null);
  return content.data ? `data:${content.data.mime_type};base64,${content.data.base64}` : null;
}

/** JPEG/PNG va 5 MB gacha; xato bo'lsa server xato kodi (matni errorMessage'dan), aks holda null. */
export const imageProblem = (f: File) =>
  !['image/jpeg', 'image/png'].includes(f.type)
    ? 'FILE_SIGNATURE_INVALID'
    : f.size > 5 * 1024 * 1024
      ? 'FILE_SIZE_INVALID'
      : null;
export const uploadImage = async (projectId: string, f: File, idempotencyKey?: string) =>
  api<{ id: string }>('/v1/files', {
    method: 'POST',
    idempotencyKey,
    body: {
      project_id: projectId,
      name: f.name.slice(0, 200),
      mime_type: f.type,
      base64: await readAsBase64(f),
    },
  });

/** Ko'p tanlovli ro'yxat: tugma tanlanganlarni ko'rsatadi, ro'yxat oqim ichida ochiladi (modal ichida qirqilmaydi). */
function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  empty,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const chosen = options.filter((o) => value.includes(o.id)).map((o) => o.name);
  return (
    <div className="field">
      <label className="field-label" htmlFor={`${id}-button`}>
        {label}
      </label>
      <button
        type="button"
        id={`${id}-button`}
        className="multi-select"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => setOpen(!open)}
      >
        <span className={chosen.length ? 'multi-select-value' : 'multi-select-value placeholder'}>
          {chosen.length ? chosen.join(', ') : placeholder}
        </span>
        <ChevronDown aria-hidden />
      </button>
      {open && (
        <div id={`${id}-list`} role="group" className="multi-select-list">
          {options.length === 0 ? (
            <p className="muted text-sm">{empty}</p>
          ) : (
            options.map((o) => (
              <label key={o.id} className="checkbox multi-select-option">
                <input
                  type="checkbox"
                  checked={value.includes(o.id)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))
                  }
                />
                <span>{o.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const blockSchema = (t: (k: string) => string) =>
  z
    .object({
      name: z.string().trim().min(1, t('common.required')).max(200),
      floors_count: z
        .string()
        .trim()
        .refine((x) => x === '' || FLOORS_RE.test(x), t('projects.zone_floors_invalid')),
      area_m2: projectSchema(t).shape.area_m2,
      planned_start: z.string(),
      planned_end: z.string(),
      actual_start: z.string(),
      actual_end: z.string(),
    })
    .superRefine((v, ctx) => checkDates(v, ctx, t));
type BlockForm = z.infer<ReturnType<typeof blockSchema>>;

/** Blok kartasi: yaratish (`zone` yo'q) va tahrirlash. Holat va smeta jami serverdan, faqat o'qish uchun. */
export function BlockModal({
  d,
  zone,
  onClose,
  onDone,
}: {
  d: ProjectDetail;
  zone: Zone | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t, lang } = useT();
  const toast = useToast();
  const { can } = useAuth();
  const canImage = can('files', 'create');
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [responsibleIds, setResponsibleIds] = useState<string[]>(zone?.responsibles.map((r) => r.id) ?? []);
  const current = useImageSrc(canImage && !removed && !picked ? (zone?.image_file_id ?? null) : null);
  useEffect(() => {
    if (!picked) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(picked);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);
  // Bir xil tanlangan fayl qayta urinishda qayta yuklanmasin (server idempotency kaliti bo'yicha bir marta saqlaydi).
  const uploadKey = useMemo(() => randomId(), [picked]);
  const shown = preview ?? current;
  const hasImage = Boolean(picked) || (!removed && Boolean(zone?.image_file_id));
  // Mas'ul: obyektga biriktirilgan faol xodimlar + joriy mas'ullar (biriktirish olingan bo'lsa ham tahrirda yo'qolmasin).
  const options = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of zone?.responsibles ?? []) byId.set(r.id, r.display_name);
    for (const m of d.members) if (m.active) byId.set(m.id, m.display_name);
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [d.members, zone]);
  const form = useForm<BlockForm>({
    resolver: zodResolver(blockSchema(t)),
    defaultValues: {
      name: zone?.name ?? '',
      floors_count: zone?.floors_count ? String(zone.floors_count) : '',
      area_m2: zone?.area_m2 ?? '',
      planned_start: dateInput(zone?.planned_start ?? null),
      planned_end: dateInput(zone?.planned_end ?? null),
      actual_start: dateInput(zone?.actual_start ?? null),
      actual_end: dateInput(zone?.actual_end ?? null),
    },
  });
  const e = form.formState.errors;
  const save = useMutation({
    mutationFn: async (v: BlockForm) => {
      let imageId = removed ? null : (zone?.image_file_id ?? null);
      if (picked) imageId = (await uploadImage(d.id, picked, uploadKey)).id;
      const card = {
        name: v.name,
        kind: 'block',
        floors_count: v.floors_count ? Number(v.floors_count) : null,
        area_m2: v.area_m2 || null,
        planned_start: v.planned_start || null,
        planned_end: v.planned_end || null,
        actual_start: v.actual_start || null,
        actual_end: v.actual_end || null,
        image_file_id: imageId,
        responsible_ids: responsibleIds,
      };
      return zone
        ? api(`/v1/projects/${d.id}/zones/${zone.id}`, {
            method: 'PATCH',
            body: { version: zone.version, ...card },
          })
        : api(`/v1/projects/${d.id}/zones`, { method: 'POST', body: card });
    },
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (err: ApiError) =>
      toast.error(
        err.code === 'VERSION_CONFLICT'
          ? t('common.version_conflict')
          : errorMessage(t, err.code, err.status),
      ),
  });
  const submit = form.handleSubmit((v) => save.mutate(v));
  const pickFile = (f: File) => {
    const problem = imageProblem(f);
    if (problem) return toast.error(errorMessage(t, problem, 400));
    setPicked(f);
    setRemoved(false);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={zone ? t('blocks.edit') : t('blocks.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="stack">
        <div className="form-grid">
          <Input label={t('blocks.field.name')} required error={e.name?.message} {...form.register('name')} />
          <Input
            type="number"
            min={1}
            max={500}
            label={t('blocks.field.floors')}
            error={e.floors_count?.message}
            {...form.register('floors_count')}
          />
          <Input
            label={t('blocks.field.land_area')}
            inputMode="decimal"
            placeholder="1000"
            error={e.area_m2?.message}
            {...form.register('area_m2')}
          />
          <MultiSelect
            label={t('blocks.field.responsibles')}
            options={options}
            value={responsibleIds}
            onChange={setResponsibleIds}
            placeholder={t('blocks.responsibles_pick')}
            empty={t('blocks.responsibles_empty')}
          />
          <Input type="date" label={t('blocks.field.planned_start')} {...form.register('planned_start')} />
          <Input type="date" label={t('blocks.field.actual_start')} {...form.register('actual_start')} />
          <Input
            type="date"
            label={t('blocks.field.planned_end')}
            error={e.planned_end?.message}
            {...form.register('planned_end')}
          />
          <Input
            type="date"
            label={t('blocks.field.actual_end')}
            error={e.actual_end?.message}
            {...form.register('actual_end')}
          />
          {zone && (
            <div className="field">
              <span className="field-label">{t('blocks.field.status')}</span>
              <span>
                <ZoneStatusBadge status={zone.status} />
              </span>
              <span className="field-hint">{t('blocks.status_hint')}</span>
            </div>
          )}
          {zone?.estimate_total != null && (
            <Input
              readOnly
              label={t('blocks.field.estimate')}
              hint={t('blocks.estimate_hint')}
              value={formatMoney(zone.estimate_total, lang)}
            />
          )}
        </div>
        {canImage && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="text-sm">{t('blocks.field.image')}</span>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="image-slot">
                {shown ? <img src={shown} alt="" /> : <ImageIcon size={20} aria-hidden />}
              </div>
              <Button variant="secondary" icon={<Upload />} onClick={() => input.current?.click()}>
                {t('projects.image_pick')}
              </Button>
              {hasImage && (
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  onClick={() => {
                    setPicked(null);
                    setRemoved(true);
                  }}
                >
                  {t('projects.image_remove')}
                </Button>
              )}
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png"
                hidden
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (f) pickFile(f);
                  ev.target.value = '';
                }}
              />
            </div>
            <p className="muted text-xs">{t('projects.image_hint')}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
