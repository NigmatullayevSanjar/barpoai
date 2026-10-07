import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Alert, Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { readAsBase64, useFileContent, useWorkMutation, type FileMeta } from './model';

function Thumb({ file, onOpen }: { file: FileMeta; onOpen: () => void }) {
  const content = useFileContent(file.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 0,
        width: 96,
        height: 96,
        overflow: 'hidden',
        background: 'var(--surface-2)',
        cursor: 'pointer',
      }}
      aria-label={file.name}
    >
      {content.data ? (
        <img
          src={`data:${content.data.mime_type};base64,${content.data.base64}`}
          alt={file.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <ImageIcon size={20} style={{ margin: 36, color: 'var(--muted)' }} />
      )}
    </button>
  );
}
/** Hisobot yoki vazifa fotosuratlari: ko'rish, yuklash (JPEG/PNG ≤ 5 MB), arxivlash. */
export function PhotoGallery({
  files,
  projectId,
  reportId,
  taskId,
  canUpload,
  canDelete,
}: {
  files: FileMeta[];
  projectId: string;
  reportId?: string;
  taskId?: string;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const { t } = useT();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<FileMeta | null>(null);
  const opened = useFileContent(open?.id ?? null);
  const upload = useWorkMutation(
    async (f: File) => {
      if (!['image/jpeg', 'image/png'].includes(f.type))
        throw Object.assign(new Error('FILE_SIGNATURE_INVALID'), {
          code: 'FILE_SIGNATURE_INVALID',
          status: 400,
        });
      if (f.size > 5 * 1024 * 1024)
        throw Object.assign(new Error('FILE_SIZE_INVALID'), { code: 'FILE_SIZE_INVALID', status: 400 });
      return api('/v1/files', {
        method: 'POST',
        body: {
          project_id: projectId,
          ...(reportId ? { report_id: reportId } : {}),
          ...(taskId ? { task_id: taskId } : {}),
          name: f.name.slice(0, 200),
          mime_type: f.type,
          base64: await readAsBase64(f),
        },
      });
    },
    undefined,
    'reports.uploaded',
  );
  const remove = useWorkMutation((id: string) =>
    api(`/v1/files/${id}`, { method: 'DELETE', body: { reason: 'Foydalanuvchi tomonidan olib tashlandi' } }),
  );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        {files.map((f) => (
          <Thumb key={f.id} file={f} onOpen={() => setOpen(f)} />
        ))}
        {canUpload && (
          <>
            <Button
              variant="secondary"
              icon={<Upload />}
              loading={upload.isPending}
              onClick={() => input.current?.click()}
            >
              {t('reports.upload')}
            </Button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
      {canUpload && <p className="muted text-xs">{t('reports.upload_hint')}</p>}
      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={open.name}
          size="lg"
          footer={
            canDelete ? (
              <Button
                variant="danger"
                icon={<Trash2 />}
                onClick={() => {
                  remove.mutate(open.id);
                  setOpen(null);
                }}
              >
                {t('common.delete')}
              </Button>
            ) : undefined
          }
        >
          {opened.data ? (
            <img
              src={`data:${opened.data.mime_type};base64,${opened.data.base64}`}
              alt={open.name}
              style={{ maxWidth: '100%', borderRadius: 8 }}
            />
          ) : (
            <Alert tone="info">{t('common.loading')}</Alert>
          )}
        </Modal>
      )}
      <span hidden>{toast ? 1 : 0}</span>
    </div>
  );
}
