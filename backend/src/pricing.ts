import { Decimal } from 'decimal.js';
import { dec, money } from './money.js';
import { invariant } from './errors.js';

/**
 * Narx varaqasi hisobi (docs/TZ_VA_NARX_REJASI.md, 4-bo'lim). DB'siz sof funksiyalar: kirish — zonalar daraxti,
 * faol xonadonlar, zona bo'yicha reja va fakt yig'indilari; chiqish — guruhlar yig'masi va xonadon qatorlari.
 * Hamma pul decimal string, hisob decimal.js bilan (precision 40, money.ts).
 */
export type PricingZone = { id: string; parent_id: string | null; kind: string; name: string };
export type PricingPremise = {
  id: string;
  zone_id: string | null;
  number: string;
  kind: string;
  rooms: number | null;
  floor: number | null;
  area_m2: string;
  /** Ro'yxat tartibidagi o'rni (bazadan, collation bilan); bo'lmasa JS taqqoslashi ishlatiladi. */
  rank?: number;
};
/** Zona bo'yicha yig'indi; `zone_id=null` — zonasiz (umumiy) xarajat. */
export type CostRow = { zone_id: string | null; amount: string };
export type PricingInput = {
  zones: PricingZone[];
  premises: PricingPremise[];
  plan: CostRow[];
  fact: CostRow[];
  markup_percent: string;
  round_uzs: string;
  round_usd: string;
  usd_rate: string | null;
};
export type PricingGroup = {
  zone_id: string | null;
  zone_name: string | null;
  premises: number;
  area_m2: string;
  plan_value: string;
  fact_value: string;
  forecast_value: string;
  forecast_m2: string;
};
export type PricingLine = {
  premise_id: string;
  position: number;
  number: string;
  kind: string;
  rooms: number | null;
  floor: number | null;
  area_m2: string;
  zone_id: string | null;
  zone_name: string | null;
  block_name: string | null;
  entrance_name: string | null;
  cost: string;
  cost_m2: string;
  sale_m2: string;
  price: string;
  sale_m2_usd: string | null;
  price_usd: string | null;
};
export type PricingResult = {
  groups: PricingGroup[];
  lines: PricingLine[];
  premises_count: number;
  area_total: string;
  plan_total: string;
  fact_total: string;
  forecast_total: string;
};

const ZERO = new Decimal(0);
/** R1: qadamgacha yaxlitlash, ROUND_HALF_UP (qadam 1 000: 4 124 500 → 4 125 000; qadam 1: 322.27 → 322). */
export const roundStep = (value: Decimal, step: string) =>
  value.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(step);

const sumByZone = (rows: CostRow[]) => {
  const out = new Map<string, Decimal>();
  for (const r of rows) {
    const key = r.zone_id ?? '';
    out.set(key, (out.get(key) ?? ZERO).add(r.amount));
  }
  return out;
};
type Member = {
  p: PricingPremise;
  area: Decimal;
  chain: PricingZone[];
  block: PricingZone | null;
  entrance: PricingZone | null;
};
const cmp = (a: string | number | null, b: string | number | null) => {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
};
/**
 * Ro'yxat tartibi (routes-premises.ts): blok nomi, blok id, qavat, raqam uzunligi, raqam, id; NULL avval.
 * Baza bergan `rank` ustun (Postgres collation JS `<` dan farq qilishi mumkin); u bo'lmasa shu qoida JS'da.
 */
const byListOrder = (a: Member, b: Member) =>
  (a.p.rank !== undefined && b.p.rank !== undefined ? a.p.rank - b.p.rank : 0) ||
  cmp(a.block?.name ?? null, b.block?.name ?? null) ||
  cmp(a.block?.id ?? null, b.block?.id ?? null) ||
  cmp(a.p.floor, b.p.floor) ||
  cmp(a.p.number.length, b.p.number.length) ||
  cmp(a.p.number, b.p.number) ||
  cmp(a.p.id, b.p.id);

export function buildPriceList(input: PricingInput): PricingResult {
  const zones = new Map(input.zones.map((z) => [z.id, z]));
  const chainOf = (zoneId: string | null) => {
    const out: PricingZone[] = [];
    const seen = new Set<string>();
    for (let id = zoneId; id && !seen.has(id); ) {
      const z = zones.get(id);
      if (!z) break;
      seen.add(id);
      out.push(z);
      id = z.parent_id;
    }
    return out;
  };
  const members: Member[] = input.premises.map((p) => {
    const chain = chainOf(p.zone_id);
    return {
      p,
      area: dec(p.area_m2),
      chain,
      block: chain.find((z) => z.kind === 'block') ?? null,
      entrance: chain.find((z) => z.kind === 'entrance') ?? null,
    };
  });
  invariant(members.length > 0, 'PRICE_LIST_NO_PREMISES');
  members.sort(byListOrder);
  // Zona → daraxtidagi xonadonlar (zonaning o'zi va barcha ota zonalari uchun).
  const under = new Map<string, Member[]>();
  for (const m of members)
    for (const z of m.chain) {
      const list = under.get(z.id);
      if (list) list.push(m);
      else under.set(z.id, [m]);
    }
  const plan = sumByZone(input.plan);
  const fact = sumByZone(input.fact);
  // 4.1 (egasi, 2026-10-11): xonadonsiz zonaning xarajati eng yaqin xonadonli ota zonaga (o'zi ham bo'lishi mumkin);
  // bunday ota zona bo'lmasa va zonasiz xarajat — umumiy guruh C.
  let commonPlan = plan.get('') ?? ZERO;
  let commonFact = fact.get('') ?? ZERO;
  const groupPlan = new Map<string, Decimal>();
  const groupFact = new Map<string, Decimal>();
  const targetOf = (id: string) => chainOf(id).find((z) => under.get(z.id)?.length)?.id ?? null;
  for (const id of new Set([...plan.keys(), ...fact.keys()])) {
    if (!id) continue;
    const target = targetOf(id);
    if (!target) {
      commonPlan = commonPlan.add(plan.get(id) ?? ZERO);
      commonFact = commonFact.add(fact.get(id) ?? ZERO);
      continue;
    }
    groupPlan.set(target, (groupPlan.get(target) ?? ZERO).add(plan.get(id) ?? ZERO));
    groupFact.set(target, (groupFact.get(target) ?? ZERO).add(fact.get(id) ?? ZERO));
  }
  const zoneGroups = [...new Set([...groupPlan.keys(), ...groupFact.keys()])].map((id) => ({
    zone: zones.get(id)!,
    plan: groupPlan.get(id) ?? ZERO,
    fact: groupFact.get(id) ?? ZERO,
    members: under.get(id)!,
  }));
  zoneGroups.sort((a, b) => cmp(a.zone.name, b.zone.name) || cmp(a.zone.id, b.zone.id));
  // 4.2: prognoz = max(reja, fakt); maydon ulushi bo'yicha 2 xonaga pastga; qoldiq tartibdagi oxirgi xonadonga.
  const cost = new Map<string, Decimal>();
  const areaOf = (ms: Member[]) => ms.reduce((s, m) => s.add(m.area), ZERO);
  const allocate = (total: Decimal, ms: Member[]) => {
    const areaSum = areaOf(ms);
    let given = ZERO;
    ms.forEach((m, i) => {
      const share =
        i === ms.length - 1
          ? total.minus(given)
          : total.mul(m.area).div(areaSum).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      given = given.add(share);
      cost.set(m.p.id, (cost.get(m.p.id) ?? ZERO).add(share));
    });
  };
  const groups: PricingGroup[] = [];
  let forecastTotal = ZERO;
  const group = (zone: PricingZone | null, p: Decimal, f: Decimal, ms: Member[]) => {
    const forecast = Decimal.max(p, f);
    const area = areaOf(ms);
    allocate(forecast, ms);
    forecastTotal = forecastTotal.add(forecast);
    groups.push({
      zone_id: zone?.id ?? null,
      zone_name: zone?.name ?? null,
      premises: ms.length,
      area_m2: money(area),
      plan_value: money(p),
      fact_value: money(f),
      forecast_value: money(forecast),
      forecast_m2: money(forecast.div(area)),
    });
  };
  for (const g of zoneGroups) group(g.zone, g.plan, g.fact, g.members);
  group(null, commonPlan, commonFact, members);
  invariant(forecastTotal.gt(0), 'PRICE_LIST_NO_COSTS');
  // 4.3: narx. tannarx_m2 yaxlitlanmagan holda ishlatiladi, saqlashda 2 xona.
  const markup = dec(input.markup_percent).div(100).add(1);
  const rate = input.usd_rate ? dec(input.usd_rate) : null;
  let costTotal = ZERO;
  const lines: PricingLine[] = members.map((m, position) => {
    const c = cost.get(m.p.id) ?? ZERO;
    costTotal = costTotal.add(c);
    const costM2 = c.div(m.area);
    const saleM2 = roundStep(costM2.mul(markup), input.round_uzs);
    const price = roundStep(m.area.mul(saleM2), input.round_uzs);
    const saleM2Usd = rate ? roundStep(saleM2.div(rate), input.round_usd) : null;
    const priceUsd = saleM2Usd ? roundStep(m.area.mul(saleM2Usd), input.round_usd) : null;
    return {
      premise_id: m.p.id,
      position,
      number: m.p.number,
      kind: m.p.kind,
      rooms: m.p.rooms,
      floor: m.p.floor,
      area_m2: money(m.area),
      zone_id: m.p.zone_id,
      zone_name: m.chain[0]?.name ?? null,
      block_name: m.block?.name ?? null,
      entrance_name: m.entrance?.name ?? null,
      cost: money(c),
      cost_m2: money(costM2),
      sale_m2: money(saleM2),
      price: money(price),
      sale_m2_usd: saleM2Usd ? money(saleM2Usd) : null,
      price_usd: priceUsd ? money(priceUsd) : null,
    };
  });
  // Invariant (4.2): Σ xonadon tannarxi = Σ guruhlar prognozi, tiyinigacha.
  invariant(costTotal.eq(forecastTotal), 'PRICE_LIST_INVARIANT', 500);
  const total = (m: Map<string, Decimal>) => [...m.values()].reduce((s, v) => s.add(v), ZERO);
  return {
    groups,
    lines,
    premises_count: members.length,
    area_total: money(areaOf(members)),
    plan_total: money(total(plan)),
    fact_total: money(total(fact)),
    forecast_total: money(forecastTotal),
  };
}
