import { z } from 'zod';
export const uuid = z.uuid();
export const text = z.string().trim().min(1).max(500);
export const date = z.iso.date();
export const timestamp = z.iso.datetime({ offset: true });
export const amount = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/);
export const qty = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/);
export const positiveAmount = amount.refine((s) => /[1-9]/.test(s), 'Musbat qiymat kerak');
export const positiveQty = qty.refine((s) => /[1-9]/.test(s), 'Musbat miqdor kerak');
export const password = z.string().min(12).max(128);
export const loginName = z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/);
// Telefon: +998 va 9 raqam; bo'sh joy, qavs va chiziqlar normalizatsiyada olib tashlanadi.
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^(\+?998)?[0-9]{9}$/))
  .transform((v) => '+998' + v.slice(-9));
// Login maydoni: foydalanuvchi nomi yoki telefon raqami.
export const identifier = z.string().trim().min(3).max(64);
export const version = z.number().int().positive();
export const reason = z.string().trim().min(5).max(2000);
export const estimateLine = z.strictObject({
  kind: z.enum(['material', 'labor', 'equipment', 'service']),
  description: text,
  zone_id: uuid.optional(),
  material_id: uuid.optional(),
  unit_id: text,
  quantity: qty,
  unit_price: amount,
  norm: qty.optional(),
  work_quantity: qty.optional(),
  loss_percent: qty.optional(),
  category: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  position: z.number().int().min(0).max(100000).optional(),
  months: z
    .array(z.strictObject({ month: date, quantity: qty }))
    .max(120)
    .optional(),
});
export const estimateInput = z.strictObject({
  project_id: uuid,
  name: text,
  lines: z.array(estimateLine).min(1).max(2000),
});
export const stockInput = z.strictObject({
  project_id: uuid,
  kind: z.enum(['opening', 'receipt', 'transfer', 'consumption', 'return']),
  material_id: uuid,
  from_account_id: uuid.optional(),
  to_account_id: uuid.optional(),
  quantity: positiveQty,
  unit_cost: amount.optional(),
  estimate_line_id: uuid.optional(),
  zone_id: uuid.optional(),
  reason,
});
export const financeInput = z.strictObject({
  project_id: uuid,
  kind: z.enum([
    'allocation',
    'purchase_order',
    'supplier_invoice',
    'opening_debt',
    'labor',
    'equipment',
    'service',
    'payment',
    'receipt',
    'advance',
    'cash_transfer',
  ]),
  amount: positiveAmount,
  counterparty_id: uuid.optional(),
  zone_id: uuid.optional(),
  cash_account_id: uuid.optional(),
  target_cash_account_id: uuid.optional(),
  matched_receipt_id: uuid.optional(),
  allocated_invoice_id: uuid.optional(),
  external_ref: z.string().min(1).max(200).optional(),
  reference: z.string().trim().min(1).max(120).optional(),
  due_date: date.optional(),
  description: reason,
  document_date: date,
});
export const idParams = z.strictObject({ id: uuid });
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
