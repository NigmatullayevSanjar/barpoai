import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import { uuid, idParams, pageQuery, likePattern } from './schemas.js';
import { projectScope, allowed } from './permissions.js';
import { invariant, DomainError } from './errors.js';
import { buildPriceList } from './pricing.js';
import { kindLabels, premiseKinds, lockProjectPremises, type PremiseKind } from './premises.js';
import { xlsxFile, cell } from './xlsx.js';
import { dec, money } from './money.js';

/** R1 (egasi, 2026-10-09): UZS 1 000 so'm, USD 1 dollar. Versiyada saqlanadi, keyin o'zgarsa eski varaqlar o'zgarmaydi. */
const ROUND_UZS = '1000';
const ROUND_USD = '1';
const percent = z
  .string()
  .regex(/^(0|[1-9]\d{0,3})(\.\d{1,2})?$/)
  .refine((s) => dec(s).lte(1000), 'Ustama 0..1000 %');
const uzs = (value: string) => `${value} (UZS)`;

/** 4.1: zonalar, faol xonadonlar, zona bo'yicha reja (joriy smeta qatorlari) va fakt (expense yozuvlari, zona manbadan). */
async function loadPricingInput(db: Db, actor: Row, projectId: string) {
  const args = [actor.tenant_id, projectId];
  const zones = (
    await db.query('SELECT id,parent_id,kind,name FROM zones WHERE tenant_id=$1 AND project_id=$2', args)
  ).rows;
  // Ro'yxat tartibi bazadan (routes-premises.ts bilan bir xil ORDER BY): qoldiq shu tartibdagi oxirgi xonadonga tushadi.
  const premises = (
    await db.query(
      `SELECT p.id,p.zone_id,p.number,p.kind,p.rooms,p.floor,p.area_m2::text area_m2 FROM premises p
       LEFT JOIN zones b ON b.tenant_id=p.tenant_id AND b.id=p.block_zone_id
       WHERE p.tenant_id=$1 AND p.project_id=$2 AND p.archived_at IS NULL
       ORDER BY b.name NULLS FIRST,p.block_zone_id NULLS FIRST,p.floor NULLS FIRST,length(p.number),p.number,p.id`,
      args,
    )
  ).rows.map((row, rank) => ({ ...row, rank }));
  const plan = (
    await db.query(
      `SELECT l.zone_id,sum(l.total)::numeric(20,2)::text amount FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
       WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL GROUP BY l.zone_id`,
      args,
    )
  ).rows;
  // Zona: hujjat yoki sarf zonasi → (sarfda zona bo'lmasa) smeta qatori zonasi. Reversal zonani nusxalamaydi:
  // asl yozuvdan (reverses_id) olinadi. Egasi qarori 2026-10-11 (1-savol).
  const fact = (
    await db.query(
      `SELECT coalesce(f.zone_id,fo.zone_id,c.zone_id,co.zone_id,el.zone_id,elo.zone_id) zone_id,sum(j.amount)::numeric(20,2)::text amount
       FROM journal_entries j
       LEFT JOIN finance_documents f ON f.tenant_id=j.tenant_id AND f.id=j.finance_document_id
       LEFT JOIN finance_documents fo ON fo.tenant_id=f.tenant_id AND fo.id=f.reverses_id
       LEFT JOIN stock_commands c ON c.tenant_id=j.tenant_id AND c.id=j.stock_command_id
       LEFT JOIN stock_commands co ON co.tenant_id=c.tenant_id AND co.id=c.reverses_id
       LEFT JOIN estimate_lines el ON el.tenant_id=c.tenant_id AND el.id=c.estimate_line_id
       LEFT JOIN estimate_lines elo ON elo.tenant_id=co.tenant_id AND elo.id=co.estimate_line_id
       WHERE j.tenant_id=$1 AND j.project_id=$2 AND j.account='expense' GROUP BY 1`,
      args,
    )
  ).rows;
  return { zones, premises, plan, fact };
}
const priceList = (db: Db, actor: Row, id: string) =>
  one(
    db,
    "SELECT p.*,to_char(p.usd_rate_date,'YYYY-MM-DD') usd_rate_date,to_char(p.created_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD') created_on,u.display_name created_by_name FROM price_lists p JOIN users u ON u.id=p.created_by WHERE p.tenant_id=$1 AND p.id=$2",
    [actor.tenant_id, id],
  );

export function pricingRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/pricing/readiness',
    summary: 'Narx varaqasi uchun tayyorlik: faol xonadonlar soni va reja/fakt xarajat bormi (bo‘sh holatlar uchun)',
    permission: 'pricing.read',
    query: z.object({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const input = await loadPricingInput(db, actor, query.project_id);
      // "Xarajat bor" modul qoidasi bilan bir xil: guruh darajasida prognoz > 0 (xonadonsiz obyektda oddiy tekshiruv).
      let has_costs = [...input.plan, ...input.fact].some((r) => dec(r.amount).gt(0));
      if (input.premises.length && has_costs)
        try {
          buildPriceList({ ...input, markup_percent: '0', round_uzs: ROUND_UZS, round_usd: ROUND_USD, usd_rate: null });
        } catch (error) {
          if (!(error instanceof DomainError && error.code === 'PRICE_LIST_NO_COSTS')) throw error;
          has_costs = false;
        }
      return { premises_count: input.premises.length, has_costs };
    },
  });
  add({
    method: 'GET',
    path: '/v1/pricing/price-lists',
    summary: 'Obyektning narx varaqasi versiyalari (yangisi birinchi)',
    permission: 'pricing.read',
    sensitive: true,
    query: pageQuery.extend({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT p.*,to_char(p.usd_rate_date,'YYYY-MM-DD') usd_rate_date,u.display_name created_by_name FROM price_lists p JOIN users u ON u.id=p.created_by
             WHERE p.tenant_id=$1 AND p.project_id=$2 ORDER BY p.version DESC LIMIT $3 OFFSET $4`,
            [actor.tenant_id, query.project_id, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/pricing/price-lists',
    summary:
      'Yangi o‘zgarmas versiya: ustama foizi, R1 qadamlari va joriy CBU kursi bilan hisob (4-bo‘lim); xonadon yoki xarajat bo‘lmasa 409',
    permission: 'pricing.write',
    sensitive: true,
    body: z.strictObject({
      project_id: uuid,
      markup_percent: percent,
      note: z.string().trim().max(1000).optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      // Xonadon yozuvlari/importi bilan navbat (1503) va versiya raqami obyekt bo'yicha ketma-ket (1504).
      await lockProjectPremises(db, body.project_id);
      await db.query('SELECT pg_advisory_xact_lock(1504, hashtext($1))', [body.project_id]);
      const rate = (
        await db.query(
          "SELECT rate::text rate,to_char(rate_date,'YYYY-MM-DD') rate_date FROM exchange_rates WHERE currency='USD' ORDER BY rate_date DESC LIMIT 1",
        )
      ).rows[0];
      const input = await loadPricingInput(db, actor, body.project_id);
      const result = buildPriceList({
        ...input,
        markup_percent: body.markup_percent,
        round_uzs: ROUND_UZS,
        round_usd: ROUND_USD,
        usd_rate: rate?.rate ?? null,
      });
      const { version } = await one(
        db,
        'SELECT coalesce(max(version),0)+1 version FROM price_lists WHERE tenant_id=$1 AND project_id=$2',
        [actor.tenant_id, body.project_id],
      );
      const header = await one(
        db,
        `INSERT INTO price_lists(tenant_id,project_id,version,markup_percent,round_uzs,round_usd,usd_rate,usd_rate_date,premises_count,area_total,plan_total,fact_total,forecast_total,groups,note,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          actor.tenant_id,
          body.project_id,
          version,
          body.markup_percent,
          ROUND_UZS,
          ROUND_USD,
          rate?.rate ?? null,
          rate?.rate_date ?? null,
          result.premises_count,
          result.area_total,
          result.plan_total,
          result.fact_total,
          result.forecast_total,
          JSON.stringify(result.groups),
          body.note || null,
          actor.id,
        ],
      );
      const col = <K extends keyof (typeof result.lines)[number]>(key: K) =>
        result.lines.map((l) => l[key]);
      await db.query(
        `INSERT INTO price_list_lines(tenant_id,price_list_id,premise_id,position,number,kind,rooms,floor,area_m2,zone_id,zone_name,block_name,entrance_name,cost,cost_m2,sale_m2,price,sale_m2_usd,price_usd)
         SELECT $1,$2,u.* FROM unnest($3::uuid[],$4::int[],$5::text[],$6::text[],$7::int[],$8::int[],$9::numeric[],$10::uuid[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::numeric[],$18::numeric[],$19::numeric[])
           AS u(premise_id,position,number,kind,rooms,floor,area_m2,zone_id,zone_name,block_name,entrance_name,cost,cost_m2,sale_m2,price,sale_m2_usd,price_usd)`,
        [
          actor.tenant_id,
          header.id,
          col('premise_id'),
          col('position'),
          col('number'),
          col('kind'),
          col('rooms'),
          col('floor'),
          col('area_m2'),
          col('zone_id'),
          col('zone_name'),
          col('block_name'),
          col('entrance_name'),
          col('cost'),
          col('cost_m2'),
          col('sale_m2'),
          col('price'),
          col('sale_m2_usd'),
          col('price_usd'),
        ],
      );
      await audit(db, actor, 'price_list.create', header.id, {
        project_id: body.project_id,
        version,
        markup_percent: body.markup_percent,
      });
      // date ustuni pg'da Date bo'lib keladi (vaqt zonasi siljishi); API har doim YYYY-MM-DD matn beradi
      return { ...header, usd_rate_date: rate?.rate_date ?? null, created_by_name: actor.display_name };
    },
  });
  add({
    method: 'GET',
    path: '/v1/pricing/price-lists/:id',
    summary: 'Versiya detali: sarlavha, guruhlar yig‘masi va xonadon qatorlari (sahifalash; q — raqam, kind filtri)',
    permission: 'pricing.read',
    sensitive: true,
    params: idParams,
    query: pageQuery.extend({
      q: z.string().trim().max(20).optional(),
      kind: z.enum(premiseKinds).optional(),
    }),
    handler: async ({ db, actor, params, query }) => {
      const header = await priceList(db, actor, params.id);
      await projectScope(db, actor, header.project_id);
      const where = `l.tenant_id=$1 AND l.price_list_id=$2 AND ($3::text IS NULL OR l.number ILIKE $3 ESCAPE '\\') AND ($4::text IS NULL OR l.kind=$4)`;
      const args = [actor.tenant_id, header.id, query.q ? likePattern(query.q) : null, query.kind ?? null];
      const lines = (
        await db.query(
          `SELECT l.* FROM price_list_lines l WHERE ${where} ORDER BY l.position LIMIT $5 OFFSET $6`,
          [...args, query.limit, query.offset],
        )
      ).rows;
      const { n } = await one(db, `SELECT count(*)::int n FROM price_list_lines l WHERE ${where}`, args);
      return { ...header, lines, lines_total: n };
    },
  });
  add({
    method: 'GET',
    path: '/v1/pricing/price-lists/:id/export',
    summary: 'Narx varaqasi Excel tanlangan valyutada (USD — versiya kursi bilan; kurs bo‘lmasa 409); prices.read shart; auditga yoziladi',
    permission: 'pricing.read',
    params: idParams,
    query: z.object({ currency: z.enum(['UZS', 'USD']).default('UZS') }),
    handler: async ({ db, actor, params, query }) => {
      const header = await priceList(db, actor, params.id);
      const project = await projectScope(db, actor, header.project_id);
      // Excel JSON kabi kesilmaydi: narx huquqisiz rolga (sahifa ruxsati bilan kirgan) eksport yo'q.
      invariant(await allowed(db, actor, 'prices.read'), 'FORBIDDEN', 403);
      const usd = query.currency === 'USD';
      invariant(!usd || header.usd_rate, 'PRICE_LIST_NO_RATE');
      // Faqat ko'rsatish uchun konvertatsiya: versiya kursi, 2 xona, ROUND_HALF_UP (sotuv narxlari saqlangan USD qiymatlardan).
      const show = (value: string | null) =>
        value === null ? '' : cell(usd ? money(dec(value).div(header.usd_rate)) : value);
      const cur = (label: string) => `${label} (${query.currency})`;
      const lines = (
        await db.query(
          'SELECT * FROM price_list_lines WHERE tenant_id=$1 AND price_list_id=$2 ORDER BY position',
          [actor.tenant_id, header.id],
        )
      ).rows;
      const groups = header.groups as Row[];
      await audit(db, actor, 'export.price_list', header.id, { currency: query.currency });
      return xlsxFile(
        [
          {
            name: 'Narx varaqasi',
            columns: [
              { header: 'Blok', key: 'block_name' },
              { header: 'Kirish', key: 'entrance_name' },
              { header: 'Qavat', key: 'floor', width: 8 },
              { header: 'Raqam', key: 'number', width: 10 },
              { header: 'Tur', key: 'kind', width: 12 },
              { header: 'Xonalar', key: 'rooms', width: 9 },
              { header: 'Maydon, m²', key: 'area_m2', width: 12 },
              { header: cur('Tannarx m²'), key: 'cost_m2', width: 18 },
              { header: cur('Tannarx'), key: 'cost', width: 20 },
              { header: cur('Sotuv m²'), key: 'sale_m2', width: 18 },
              { header: cur('Narx'), key: 'price', width: 20 },
            ],
            rows: lines.map((l) => ({
              block_name: l.block_name ?? '',
              entrance_name: l.entrance_name ?? '',
              floor: l.floor ?? '',
              number: l.number,
              kind: kindLabels.uz[l.kind as PremiseKind] ?? l.kind,
              rooms: l.rooms ?? '',
              area_m2: cell(l.area_m2),
              cost_m2: show(l.cost_m2),
              cost: show(l.cost),
              sale_m2: cell(usd ? l.sale_m2_usd : l.sale_m2),
              price: cell(usd ? l.price_usd : l.price),
            })),
          },
          {
            name: 'Guruhlar',
            columns: [
              { header: 'Guruh', key: 'zone_name', width: 24 },
              { header: 'Xonadonlar', key: 'premises', width: 12 },
              { header: 'Maydon, m²', key: 'area_m2', width: 12 },
              { header: cur('Reja'), key: 'plan_value', width: 20 },
              { header: cur('Fakt'), key: 'fact_value', width: 20 },
              { header: cur('Prognoz'), key: 'forecast_value', width: 20 },
              { header: cur('Prognoz m²'), key: 'forecast_m2', width: 18 },
            ],
            rows: groups.map((g) => ({
              zone_name: g.zone_name ?? 'Umumiy',
              premises: g.premises,
              area_m2: cell(g.area_m2),
              plan_value: show(g.plan_value),
              fact_value: show(g.fact_value),
              forecast_value: show(g.forecast_value),
              forecast_m2: show(g.forecast_m2),
            })),
          },
          {
            name: 'Versiya',
            columns: [
              { header: 'Ko‘rsatkich', key: 'k', width: 24 },
              { header: 'Qiymat', key: 'v', width: 30 },
            ],
            rows: [
              ['Obyekt', project.name],
              ['Versiya', header.version],
              ['Sana', header.created_on],
              ['Muallif', header.created_by_name],
              ['Ustama, %', cell(header.markup_percent)],
              ['Yaxlitlash UZS', cell(header.round_uzs)],
              ['Yaxlitlash USD', cell(header.round_usd)],
              ['Kurs, 1 USD', header.usd_rate ? cell(header.usd_rate) : '—'],
              ['Kurs sanasi', header.usd_rate_date ?? '—'],
              ['Xonadonlar', header.premises_count],
              ['Maydon, m²', cell(header.area_total)],
              [uzs('Reja'), cell(header.plan_total)],
              [uzs('Fakt'), cell(header.fact_total)],
              [uzs('Prognoz'), cell(header.forecast_total)],
              ['Izoh', header.note ?? ''],
            ].map(([k, v]) => ({ k, v })),
          },
        ],
        `${project.code ?? project.name}-narx-v${header.version}-${query.currency}`,
      );
    },
  });
}
