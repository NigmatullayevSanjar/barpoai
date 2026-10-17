import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatDate, formatMoney, todayIso } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Button, PageHeader, Stat } from '@/components/ui';
import { ProjectFilter, useProjectFilter } from './pages';
import { monthLabel, type CalendarData } from './model';

/**
 * Figma F5 (2026-10-17) "To'lov kalendari": KPI (bugun, hafta, oy — serverdan), oylik to'r (nuqtalar: bajarilgan,
 * rejalashtirilgan, muddati o'tgan), tanlangan kun ro'yxati. Manba — muddatli hujjat qoldiqlari, ochiq so'rovlar va
 * bajarilgan to'lovlar; summalar hisoblanmaydi, faqat ko'rsatiladi.
 */
type State = 'paid' | 'planned' | 'overdue';
type Item = {
  key: string;
  day: string;
  state: State;
  title: string;
  sub: string;
  amount: string;
  status: string;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export function PaymentCalendarPage() {
  const { t, lang } = useT();
  const f = useProjectFilter();
  const today = todayIso();
  const [first, setFirst] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  });
  const [selected, setSelected] = useState(today);
  // Dushanbadan boshlanadigan to'r: oy boshidan oldingi va oxiridan keyingi kunlar ham ko'rinadi.
  const grid = useMemo(() => {
    const lead = (first.getUTCDay() + 6) % 7;
    const start = addDays(first, -lead);
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const rows = Math.ceil((lead + daysInMonth) / 7);
    return { start, days: Array.from({ length: rows * 7 }, (_, i) => iso(addDays(start, i))) };
  }, [first]);
  const from = grid.days[0]!;
  const to = grid.days[grid.days.length - 1]!;
  const query = useQuery({
    queryKey: ['finance-calendar', f.projectId, from, to],
    queryFn: () =>
      api<CalendarData>(`/v1/finance/calendar${qs({ project_id: f.projectId || undefined, from, to })}`),
  });
  const d = query.data;
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const doc of d?.documents ?? [])
      out.push({
        key: `d:${doc.id}`,
        day: doc.due_date,
        state: doc.due_date < today ? 'overdue' : 'planned',
        title: doc.reference ? `${doc.reference} · ${doc.description}` : doc.description,
        sub: [t(`fin.kind.${doc.kind}`), doc.counterparty_name, doc.project_name].filter(Boolean).join(' · '),
        amount: doc.outstanding,
        status: doc.due_date < today ? t('fin.cal.legend.overdue') : t('fin.cal.legend.planned'),
      });
    for (const r of d?.requests ?? [])
      out.push({
        key: `r:${r.id}`,
        day: r.due_date,
        state: r.due_date < today ? 'overdue' : 'planned',
        title: r.purpose,
        sub: [t('fin.pr.title'), r.counterparty_name, r.project_name].join(' · '),
        amount: r.amount,
        status: t(`fin.pr.status.${r.status}`),
      });
    for (const p of d?.payments ?? [])
      out.push({
        key: `p:${p.id}`,
        day: p.document_date,
        state: 'paid',
        title: p.reference ? `${p.reference} · ${p.description}` : p.description,
        sub: [p.counterparty_name, p.project_name].filter(Boolean).join(' · '),
        amount: p.amount,
        status: t('fin.cal.paid_label'),
      });
    return out;
  }, [d, t, today]);
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) m.set(it.day, [...(m.get(it.day) ?? []), it]);
    return m;
  }, [items]);
  const statesOf = (day: string): State[] => {
    const set = new Set((byDay.get(day) ?? []).map((i) => i.state));
    return (['overdue', 'planned', 'paid'] as State[]).filter((s) => set.has(s));
  };
  const shift = (n: number) =>
    setFirst(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1)));
  const kpi = (n: number, amount: string) =>
    t('fin.cal.n_amount', { n, amount: `${formatMoney(amount, lang, false)} ${displayCurrency()}` });
  const s = d?.summary;
  const dayItems = byDay.get(selected) ?? [];
  const weekday = new Date(selected + 'T00:00:00Z').toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('fin.cal.title')} description={t('fin.cal.sub')} />
      <div className="toolbar blocks-toolbar">
        <ProjectFilter f={f} />
        <span className="spacer" />
        <span className="muted text-sm">
          {t('fin.cal.overdue_total')}: <b>{d ? formatMoney(d.overdue.amount, lang, false) : '—'}</b>
          {d ? ` · ${d.overdue.count}` : ''}
        </span>
      </div>
      <div className="grid-3">
        <Stat
          label={t('fin.cal.today')}
          value={s ? kpi(s.today_count, s.today_amount) : '—'}
          tone={s && s.today_count > 0 ? 'warning' : undefined}
        />
        <Stat label={t('fin.cal.week_plan')} value={s ? kpi(s.week_count, s.week_amount) : '—'} />
        <Stat label={t('fin.cal.month_total')} value={s ? kpi(s.month_count, s.month_amount) : '—'} />
      </div>
      <div className="cal-layout">
        <section className="card">
          <div className="card-header">
            <h3>{monthLabel(iso(first), lang)}</h3>
            <span className="row" style={{ gap: 6 }}>
              <Button
                size="sm"
                variant="secondary"
                icon={<ChevronLeft />}
                aria-label={t('fin.cal.prev')}
                onClick={() => shift(-1)}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<ChevronRight />}
                aria-label={t('fin.cal.next')}
                onClick={() => shift(1)}
              />
            </span>
          </div>
          <div className="cal-grid" role="grid">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="cal-weekday" role="columnheader">
                {t(`fin.cal.weekday.${i}`)}
              </div>
            ))}
            {grid.days.map((day) => {
              const other = day.slice(0, 7) !== iso(first).slice(0, 7);
              const states = statesOf(day);
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-selected={day === selected}
                  className={`cal-cell${other ? ' other' : ''}${day === selected ? ' selected' : ''}${day === today ? ' today' : ''}`}
                  onClick={() => setSelected(day)}
                >
                  {Number(day.slice(8, 10))}
                  {states.length > 0 && (
                    <span className="cal-dots" aria-hidden>
                      {states.map((st) => (
                        <span key={st} className={`cal-dot ${st}`} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="cal-legend">
            <span>
              <span className="cal-dot paid" /> {t('fin.cal.legend.paid')}
            </span>
            <span>
              <span className="cal-dot planned" /> {t('fin.cal.legend.planned')}
            </span>
            <span>
              <span className="cal-dot overdue" /> {t('fin.cal.legend.overdue')}
            </span>
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>
              {formatDate(selected, lang)}, {weekday}
              <span className="card-sub">{t('fin.cal.day_title')}</span>
            </h3>
          </div>
          <div className="card-pad">
            {dayItems.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t('fin.cal.none_day')}
              </p>
            ) : (
              dayItems.map((it) => (
                <div key={it.key} className="cal-item">
                  <div className="cal-item-head">
                    <b>{it.title}</b>
                    <span
                      className={`status-text-${it.state === 'paid' ? 'active' : it.state === 'overdue' ? 'danger' : 'inactive'}`}
                    >
                      {it.status}
                    </span>
                  </div>
                  <span className="muted text-sm">{it.sub}</span>
                  <span className="cal-item-amount">
                    {formatMoney(it.amount, lang, false)} {displayCurrency()}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <p className="muted text-xs" style={{ margin: 0 }}>
        {t('fin.cal.no_due')}
      </p>
    </div>
  );
}
