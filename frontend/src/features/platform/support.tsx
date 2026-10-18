import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, Send } from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
  Segmented,
  Textarea,
} from '@/components/ui';
import { useApiError } from './pages';

/**
 * Figma F6 (2026-10-17) "Murojaatlar (Chat)": chapda murojaatlar ro'yxati (qidiruv, Aktivlar | Yakunlanganlar |
 * Barchasi), o'ngda suhbat — mijoz xabari va texnik xodim javobi, javob yuborish va yakunlash. Ma'lumot modeli
 * avvalgidek: bitta xabar va bitta javob (xabarlar tarixi saqlanmaydi — D17); javob murojaat egasiga bildirishnoma.
 */
type SupportRow = {
  id: string;
  tenant_id: string;
  legal_name: string;
  display_name: string;
  kind: 'support' | 'plan_change';
  message: string;
  status: 'open' | 'closed';
  response: string | null;
  responded_at: string | null;
  created_at: string;
};
type Tab = 'open' | 'closed' | 'all';

export function SupportPage() {
  const { t, lang } = useT();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const query = useQuery({
    queryKey: ['platform-support', tab],
    queryFn: () =>
      api<ListResponse<SupportRow>>(
        `/v1/platform/support${qs({ status: tab === 'all' ? undefined : tab, limit: 100, offset: 0 })}`,
      ),
  });
  const items = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (query.data?.items ?? []).filter(
      (r) =>
        !q ||
        r.legal_name.toLocaleLowerCase().includes(q) ||
        r.display_name.toLocaleLowerCase().includes(q) ||
        r.message.toLocaleLowerCase().includes(q),
    );
  }, [query.data, search]);
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const update = useMutation({
    mutationFn: (v: { id: string; status: 'open' | 'closed'; response?: string }) =>
      api(`/v1/platform/support/${v.id}`, {
        method: 'PATCH',
        body: { status: v.status, ...(v.response ? { response: v.response } : {}) },
      }),
    onSuccess: async () => {
      setText('');
      await queryClient.invalidateQueries({ queryKey: ['platform-support'] });
    },
    onError,
  });
  const initials = (r: SupportRow) => r.legal_name;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('support.title')} description={t('support.sub')} />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      <div className="chat-layout">
        <section className="card">
          <div className="card-pad stack" style={{ gap: 10, paddingBottom: 10 }}>
            <SearchInput value={search} onChange={setSearch} placeholder={t('support.search')} />
            <Segmented<Tab>
              value={tab}
              onChange={(v) => {
                setTab(v);
                setSelectedId(null);
              }}
              items={[
                { key: 'open', label: t('support.active') },
                { key: 'closed', label: t('support.done') },
                { key: 'all', label: t('common.all') },
              ]}
            />
          </div>
          {query.data && items.length === 0 ? (
            <p className="card-pad muted" style={{ paddingTop: 0 }}>
              {t('support.empty')}
            </p>
          ) : (
            <ul className="chat-list">
              {items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`chat-item${r.id === selectedId ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedId(r.id);
                      setText('');
                    }}
                  >
                    <Avatar name={initials(r)} />
                    <span className="chat-main">
                      <span style={{ fontWeight: 600, display: 'block' }}>{r.legal_name}</span>
                      <span className="chat-preview">{r.message}</span>
                    </span>
                    <span className="chat-meta">
                      <span>{formatDate(r.created_at, lang)}</span>
                      {r.status === 'open' && !r.response ? (
                        <span className="chat-unread">1</span>
                      ) : (
                        <Badge tone={r.status === 'open' ? 'warning' : 'success'}>
                          {t(`support.${r.status}`)}
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          {!selected ? (
            <EmptyState title={t('support.pick')} />
          ) : (
            <>
              <div className="card-header">
                <span className="row" style={{ gap: 12 }}>
                  <Avatar name={selected.legal_name} />
                  <span>
                    <b style={{ display: 'block' }}>{selected.legal_name}</b>
                    <small className="muted">
                      {t(`support.kind.${selected.kind}`)} · {selected.display_name}
                    </small>
                  </span>
                </span>
                {selected.status === 'open' ? (
                  <Button
                    icon={<Check />}
                    loading={
                      update.isPending && update.variables?.id === selected.id && !update.variables?.response
                    }
                    onClick={() =>
                      update.mutate({
                        id: selected.id,
                        status: 'closed',
                        ...(text.trim() ? { response: text.trim() } : {}),
                      })
                    }
                  >
                    {t('support.finish')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    icon={<RotateCcw />}
                    loading={update.isPending && update.variables?.id === selected.id}
                    onClick={() => update.mutate({ id: selected.id, status: 'open' })}
                  >
                    {t('support.reopen')}
                  </Button>
                )}
              </div>
              <div className="chat-body">
                <span className="chat-day">{formatDate(selected.created_at, lang)}</span>
                <div className="chat-bubble">
                  <div className="chat-who">
                    {selected.legal_name} · {t('support.client')}
                  </div>
                  {selected.message}
                  <div className="chat-time">{formatDateTime(selected.created_at, lang)}</div>
                </div>
                {selected.response && (
                  <div className="chat-bubble staff">
                    <div className="chat-who">{t('support.staff')}</div>
                    {selected.response}
                    {selected.responded_at && (
                      <div className="chat-time">{formatDateTime(selected.responded_at, lang)}</div>
                    )}
                  </div>
                )}
              </div>
              {selected.status === 'open' && (
                <div className="chat-footer">
                  <Textarea
                    wrapClassName="grow"
                    label={t('support.response')}
                    hint={selected.response ? t('support.one_response') : t('support.response_hint')}
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <Button
                    icon={<Send />}
                    disabled={text.trim().length < 2}
                    loading={
                      update.isPending &&
                      Boolean(update.variables?.response) &&
                      update.variables?.status === 'open'
                    }
                    onClick={() => update.mutate({ id: selected.id, status: 'open', response: text.trim() })}
                  >
                    {t('support.send')}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
