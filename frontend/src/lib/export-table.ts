import { api } from './api';
import { saveBase64File } from './download';

/** Ekrandagi jadvalni server orqali Excel (xlsx) qilib yuklab olish (chop etish/PDF o'rniga). Qiymatlar UZS. */
export async function exportTable(input: {
  filename: string;
  sheet: string;
  title?: string;
  headers: string[];
  rows: (string | number | null)[][];
}) {
  const file = await api<{ filename: string; mime_type: string; base64: string }>('/v1/exports/table', {
    method: 'POST',
    body: input,
  });
  saveBase64File(file);
}
