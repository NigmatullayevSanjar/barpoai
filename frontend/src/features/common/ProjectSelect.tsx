import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type ListResponse } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Select } from '@/components/ui';
import type { Project } from '@/features/projects/types';

const KEY = 'barpo.project';
/** Tanlangan obyekt URL (?project=) va localStorage'da saqlanadi; modullar bo'ylab bir xil. */
export function useProjectSelection() {
  const [params, setParams] = useSearchParams();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ListResponse<Project>>('/v1/projects?limit=100'),
  });
  const items = projects.data?.items ?? [];
  const fromUrl = params.get('project');
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  const candidate = fromUrl ?? stored;
  const projectId = items.length ? (items.some((p) => p.id === candidate) ? candidate! : items[0]!.id) : '';
  const setProjectId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      if (id) next.set('project', id);
      else next.delete('project');
      setParams(next, { replace: true });
      try {
        localStorage.setItem(KEY, id);
      } catch {
        /* ignore */
      }
    },
    [params, setParams],
  );
  useEffect(() => {
    if (projectId && projectId !== fromUrl) setProjectId(projectId);
  }, [projectId, fromUrl, setProjectId]);
  return {
    projectId,
    setProjectId,
    projects: items,
    project: items.find((p) => p.id === projectId) ?? null,
    loading: projects.isLoading,
  };
}
export function ProjectSelect({
  value,
  onChange,
  projects,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  projects: Project[];
  label?: boolean;
}) {
  const { t } = useT();
  return (
    <Select
      aria-label={t('erp.select_project')}
      label={label ? t('erp.select_project') : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: 240 }}
    >
      {projects.length === 0 && <option value="">{t('erp.select_project')}</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code ? `${p.code} · ` : ''}
          {p.name}
        </option>
      ))}
    </Select>
  );
}
