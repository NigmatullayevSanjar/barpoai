import { useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { displayCurrency, toDisplay } from '@/lib/currency-store';

/**
 * Dashboard grafiklari: inline SVG, ranglar tokens.css dagi --chart-* dan.
 * Props — serverdan kelgan string summalar va foizlar; bu yerda pul yig'indisi hisoblanmaydi.
 * Number() faqat geometriya (balandlik, burchak) uchun ishlatiladi.
 */
export type Series = { key: string; label: string; color: string; kind: 'bar' | 'line' };

/** "Chiroyli" o'q qadamlari; `top` — allaqachon ko'rsatish birligidagi eng katta qiymat. */
function ticks(top: number) {
  if (!(top > 0)) return { values: [0], top: 1 };
  const raw = top / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const n = Math.ceil(top / step);
  return { values: Array.from({ length: n + 1 }, (_, i) => i * step), top: n * step };
}

function Legend({
  items,
}: {
  items: { label: ReactNode; color: string; line?: boolean; value?: ReactNode }[];
}) {
  return (
    <ul className="chart-legend">
      {items.map((it, i) => (
        <li key={i}>
          <span className={`chart-swatch${it.line ? ' line' : ''}`} style={{ background: it.color }} />
          <span>{it.label}</span>
          {it.value !== undefined && <b>{it.value}</b>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Oylar bo'yicha guruhlangan ustunlar (+ ixtiyoriy chiziq seriya), bitta o'q.
 * `unit='money'` — UZS summalar, ko'rsatish valyutasiga formatMoney orqali o'tadi; `unit='count'` — oddiy sonlar.
 */
export function MonthlyChart({
  rows,
  series,
  monthLabel,
  title,
  unit = 'money',
}: {
  rows: (Record<string, string> & { month: string })[];
  series: Series[];
  monthLabel: (month: string) => string;
  title: string;
  unit?: 'money' | 'count';
}) {
  const { lang } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const pin = displayCurrency();
  const money = (v: string | number) =>
    unit === 'count' ? String(Math.round(Number(v))) : formatMoney(v, lang, false);
  const axis = (v: number) => (unit === 'count' ? String(v) : formatMoney(v, lang, false, pin));
  const displayOf = (v: string) => (unit === 'count' ? Number(v) : Number(toDisplay(v)?.amount ?? 0));
  const max = Math.max(0, ...rows.flatMap((r) => series.map((s) => displayOf(r[s.key]!))));
  const scale = ticks(max);
  const W = 640,
    H = 240,
    left = 112,
    right = 8,
    top = 8,
    bottom = 28;
  const plotW = W - left - right,
    plotH = H - top - bottom;
  const band = plotW / Math.max(1, rows.length);
  const bars = series.filter((s) => s.kind === 'bar');
  const barW = Math.min(18, (band * 0.7) / Math.max(1, bars.length));
  const y = (v: string) => top + plotH - (Math.max(0, displayOf(v)) / scale.top) * plotH;
  const cx = (i: number) => left + band * i + band / 2;
  return (
    <figure className="chart" aria-label={title}>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color, line: s.kind === 'line' }))} />
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {scale.values.map((v) => {
            const yy = top + plotH - (v / scale.top) * plotH;
            return (
              <g key={v}>
                <line x1={left} x2={W - right} y1={yy} y2={yy} className="chart-grid" />
                <text x={left - 8} y={yy} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                  {axis(v)}
                </text>
              </g>
            );
          })}
          {rows.map((r, i) => (
            <g key={r.month}>
              {hover === i && (
                <rect x={left + band * i} y={top} width={band} height={plotH} className="chart-hover" />
              )}
              {bars.map((s, j) => {
                const x = cx(i) - (bars.length * barW + (bars.length - 1) * 2) / 2 + j * (barW + 2);
                const yy = y(r[s.key]!);
                const h = top + plotH - yy;
                return h > 0 ? (
                  <path
                    key={s.key}
                    d={`M${x},${top + plotH} V${yy + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, barW / 2)},-${Math.min(4, h)} H${x + barW - Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, h)} V${top + plotH} Z`}
                    fill={s.color}
                  />
                ) : null;
              })}
              <text x={cx(i)} y={H - 8} className="chart-axis" textAnchor="middle">
                {`${r.month.slice(5, 7)}.${r.month.slice(2, 4)}`}
              </text>
              <rect
                x={left + band * i}
                y={top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
          {series
            .filter((s) => s.kind === 'line')
            .map((s) => (
              <g key={s.key} pointerEvents="none">
                <polyline
                  points={rows.map((r, i) => `${cx(i)},${y(r[s.key]!)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                {rows.map((r, i) => (
                  <rect
                    key={i}
                    x={cx(i) - 4}
                    y={y(r[s.key]!) - 4}
                    width={8}
                    height={8}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ))}
          <line x1={left} x2={W - right} y1={top + plotH} y2={top + plotH} className="chart-baseline" />
        </svg>
        {hover !== null && rows[hover] && (
          <div
            className="chart-tip"
            style={{
              left: `${(cx(hover) / W) * 100}%`,
              // Chetdagi oylarda karta tashqarisiga chiqmasin.
              transform:
                hover === 0 ? 'none' : hover === rows.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            <b>{monthLabel(rows[hover].month)}</b>
            {series.map((s) => (
              <div key={s.key} className="row-between" style={{ gap: 12 }}>
                <span>
                  <span
                    className={`chart-swatch${s.kind === 'line' ? ' line' : ''}`}
                    style={{ background: s.color }}
                  />{' '}
                  {s.label}
                </span>
                <span>{money(rows[hover]![s.key]!)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th />
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <th>{monthLabel(r.month)}</th>
              {series.map((s) => (
                <td key={s.key}>{money(r[s.key]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Donut: ulush foizlari serverdan; manfiy yoki nol bo'lak chizilmaydi, lekin legendada qoladi. */
export function DonutChart({
  items,
  total,
  title,
}: {
  items: { key: string; label: string; color: string; amount: string; share: string | null }[];
  total: string;
  title: string;
}) {
  const { lang } = useT();
  const R = 70,
    r = 46,
    C = 90;
  let angle = -Math.PI / 2;
  const arcs = items
    .filter((it) => it.share !== null && Number(it.share) > 0)
    .map((it) => {
      const share = Math.min(100, Number(it.share));
      const a0 = angle,
        a1 = angle + (share / 100) * Math.PI * 2;
      angle = a1;
      return { ...it, a0, a1 };
    });
  const pt = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
  return (
    <figure className="chart chart-donut" aria-label={title}>
      <svg viewBox="0 0 180 180" role="img" aria-label={title} width={180} height={180}>
        {arcs.map((a) =>
          a.a1 - a.a0 >= Math.PI * 2 - 1e-6 ? (
            <g key={a.key}>
              <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={a.color} strokeWidth={R - r}>
                <title>{`${a.label}: ${formatMoney(a.amount, lang)} · ${a.share}%`}</title>
              </circle>
            </g>
          ) : (
            <path
              key={a.key}
              d={`M${pt(R, a.a0)} A${R},${R} 0 ${a.a1 - a.a0 > Math.PI ? 1 : 0} 1 ${pt(R, a.a1)} L${pt(r, a.a1)} A${r},${r} 0 ${a.a1 - a.a0 > Math.PI ? 1 : 0} 0 ${pt(r, a.a0)} Z`}
              fill={a.color}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              <title>{`${a.label}: ${formatMoney(a.amount, lang)} · ${a.share}%`}</title>
            </path>
          ),
        )}
        <text x={C} y={C} textAnchor="middle" dominantBaseline="middle" className="chart-center">
          {formatMoney(total, lang, false)}
        </text>
        <text x={C} y={C + 18} textAnchor="middle" className="chart-axis">
          {displayCurrency()}
        </text>
      </svg>
      <Legend
        items={items.map((it) => ({
          label: it.label,
          color: it.color,
          value: (
            <>
              {formatMoney(it.amount, lang, false)}
              <small className="muted"> · {it.share === null ? '—' : `${it.share}%`}</small>
            </>
          ),
        }))}
      />
    </figure>
  );
}
