import ExcelJS from 'exceljs';
export type Sheet = {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
};
/** Excel fayl (bir yoki bir nechta varaq), qalin sarlavha. Javob JSON (base64) — smeta eksporti bilan bir xil shakl. */
export async function xlsxFile(sheets: Sheet[], filename: string) {
  const book = new ExcelJS.Workbook();
  for (const s of sheets) {
    const sheet = book.addWorksheet(s.name);
    sheet.columns = s.columns.map((c) => ({ ...c, width: c.width ?? 16 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of s.rows) sheet.addRow(row);
  }
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  return {
    filename: `${filename.replace(/[^\w.-]+/g, '_')}.xlsx`,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: buffer.toString('base64'),
  };
}
/** Decimal matn → Excel soni; bo'sh qiymat bo'sh katak. */
export const cell = (value: unknown) =>
  value === null || value === undefined || value === '' ? '' : Number(value);
