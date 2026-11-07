import { z } from 'zod';
export const uuid = z.uuid();
export const text = z.string().trim().min(1).max(500);
export const date = z.iso.date();
export const timestamp = z.iso.datetime({ offset: true });
export const amount = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/);
export const qty = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/);
export const positiveAmount = amount.refine((s) => /[1-9]/.test(s), 'Musbat qiymat kerak');
export const positiveQty = qty.refine((s) => /[1-9]/.test(s), 'Musbat miqdor kerak');
// Maydon, m²: numeric(12,2) ga sig'adigan musbat decimal string.
export const area = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
  .refine((s) => /[1-9]/.test(s), 'Musbat maydon kerak');
export const password = z.string().min(6).max(128);
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
  // V-C (D23): brigada stavkasi (so'm/birlik), faqat ish qatorlari; null — obyekt foizi ishlaydi
  labor_rate: amount.nullable().optional(),
  norm: qty.optional(),
  work_quantity: qty.optional(),
  loss_percent: qty.optional(),
  category: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  // S2: to'liq norma shifri (ish qatori), resurs/material kodi va bo'lim («Раздел …») — category o'zgarmaydi
  norm_code: z.string().trim().max(200).nullable().optional(),
  resource_code: z.string().trim().max(60).nullable().optional(),
  section_name: z.string().trim().max(300).nullable().optional(),
  // S3, D37: materialni kim beradi — pudratchi (standart) yoki buyurtmachi; faqat material qatorida «customer»
  supplied_by: z.enum(['contractor', 'customer']).optional(),
  position: z.number().int().min(0).max(100000).optional(),
  months: z
    .array(z.strictObject({ month: date, quantity: qty }))
    .max(120)
    .optional(),
});
/** S3 (D36–D39): foiz 0…100, 4 kasrgacha. */
const percent = z.string().regex(/^(100(\.0{1,4})?|[1-9]?\d(\.\d{1,4})?)$/);
/** S3: smeta sozlamalari (smeta narxi zanjiri); berilmagan maydon o'zgarmaydi. */
export const priceSettings = z.strictObject({
  markup_mode: z.enum(['free', 'vmq583']).optional(),
  other_costs_percent: percent.optional(),
  profit_percent: percent.optional(),
  production_costs_percent: percent.optional(),
  deduct_customer_materials: z.boolean().optional(),
  // null — QQS yo'q (D36)
  vat_percent: percent.nullable().optional(),
});
export const estimateInput = z.strictObject({
  project_id: uuid,
  name: text,
  // D30: smeta 20 000 qatorgacha (estimates.ts ESTIMATE_MAX_LINES bilan bir xil)
  lines: z.array(estimateLine).min(1).max(20000),
  // S3: yaratishda (masalan, Form 5 importi taklifi) yoki reviziyada smeta sozlamalari
  settings: priceSettings.optional(),
});
/** S2, D41: smeta sarlavhasi — reviziya yaratmaydi; berilmagan maydon o'zgarmaydi, null tozalaydi. */
export const estimateHeader = z.strictObject({
  basis: z.string().trim().max(1000).nullable().optional(),
  price_level_date: date.nullable().optional(),
  labor_rate_source: z.string().trim().max(500).nullable().optional(),
  contract_number: z.string().trim().max(100).nullable().optional(),
  contract_date: date.nullable().optional(),
  contract_amount: amount.nullable().optional(),
  // S3: smeta sozlamalari ham shu yerda — reviziyasiz, audit bilan
  ...priceSettings.shape,
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
    'advance_offset',
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
// Ro'yxat qidiruvi; handler bo'sh satrni "yo'q" deb oladi (`query.q ? likePattern(query.q) : null`).
export const searchText = z.string().trim().max(100).optional();
export const searchQuery = pageQuery.extend({ q: searchText });
/** `%`/`_` ni qochirib ILIKE naqshi; `ILIKE $n ESCAPE '\'` bilan ishlatiladi. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
// Query bayrog'i: "true"/"1" → true, "false"/"0" → false; z.coerce.boolean() "false" satrini true qiladi.
export const queryBool = z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] });
