import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { saveBase64File } from '@/lib/download';
import { errorMessage, useT } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/** Serverdagi Excel eksport endpointini chaqirib faylni yuklab oladi. */
export function ExportButton({ path, disabled }: { path: string; disabled?: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const run = useMutation({
    mutationFn: () => api<{ filename: string; mime_type: string; base64: string }>(path),
    onSuccess: (file) => {
      saveBase64File(file);
      toast.success(t('common.exported'));
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  return (
    <Button
      variant="secondary"
      icon={<Download />}
      loading={run.isPending}
      disabled={disabled}
      onClick={() => run.mutate()}
    >
      {t('common.export_excel')}
    </Button>
  );
}
