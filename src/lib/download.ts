/** Server JSON ko'rinishida qaytargan faylni (base64) brauzerda yuklab olish. */
export function saveBase64File(file: { filename: string; mime_type: string; base64: string }) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime_type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
