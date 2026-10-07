import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState, ErrorState, Loading, Pagination } from './index';
import { useT } from '@/lib/i18n';

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Saralash uchun qiymat; berilmasa ustun saralanmaydi */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right';
  width?: number | string;
  className?: string;
};
type Props<T> = {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  empty?: { title: ReactNode; description?: ReactNode; action?: ReactNode };
  dense?: boolean;
  /** Mijoz tomonida filtr: qidiruv matni va qaysi maydonlar bo'yicha */
  search?: { query: string; fields: (row: T) => (string | null | undefined)[] };
  pagination?: {
    offset: number;
    limit: number;
    onChange: (offset: number) => void;
  };
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
};
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  empty,
  dense,
  search,
  pagination,
  footer,
  rowClassName,
}: Props<T>) {
  const { t } = useT();
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const visible = useMemo(() => {
    let list = rows ?? [];
    if (search?.query) {
      const q = search.query.toLocaleLowerCase();
      list = list.filter((r) => search.fields(r).some((f) => (f ?? '').toLocaleLowerCase().includes(q)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const sv = col.sortValue;
        list = [...list].sort((a, b) => {
          const x = sv(a) ?? '',
            y = sv(b) ?? '';
          const cmp =
            typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y), undefined, {
                  numeric: true,
                });
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [rows, search?.query, sort, columns, search]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  return (
    <div className="table-wrap">
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && !rows ? (
        <Loading rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={empty?.title ?? t('common.empty')}
          description={empty?.description}
          action={empty?.action}
        />
      ) : (
        <table className={`table ${dense ? 'table-dense' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.sortValue ? 'sortable' : ''} ${c.align === 'right' ? 'num' : ''}`}
                  style={{ width: c.width }}
                  onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                  aria-sort={
                    sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  <span
                    className="row"
                    style={{
                      gap: 4,
                      justifyContent: c.align === 'right' ? 'flex-end' : undefined,
                    }}
                  >
                    {c.header}
                    {c.sortValue &&
                      (sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                className={`${onRowClick ? 'clickable' : ''} ${rowClassName?.(row) ?? ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === 'right' ? 'num' : ''} ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pagination && !error && (
        <Pagination
          offset={pagination.offset}
          limit={pagination.limit}
          count={rows?.length ?? 0}
          onChange={pagination.onChange}
        />
      )}
      {footer}
    </div>
  );
}
