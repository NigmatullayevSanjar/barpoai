/**
 * BARPO AI API mijozi.
 * - Sessiya httpOnly cookie orqali (credentials: include); Bearer token saqlanmaydi.
 * - Har bir o'zgartiruvchi so'rovga Idempotency-Key qo'shiladi; retry uchun kalitni berish mumkin.
 * - Xatolar ApiError ko'rinishida: code (server kodi), status, fields (validatsiya).
 */
export const apiBase: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public fields: { path: (string | number)[]; message: string }[] = [],
    public requestId?: string,
  ) {
    super(code);
  }
}

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bir xil biznes amal uchun retry'da bir xil kalit beriladi. */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

const listeners = new Set<(status: number) => void>();
/** 401 holatida auth provayderi sessiyani tozalaydi. */
export function onUnauthorized(listener: (status: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = options.idempotencyKey ?? crypto.randomUUID();
  let res: Response;
  try {
    res = await fetch(apiBase + path, {
      method,
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401) listeners.forEach((l) => l(401));
    throw new ApiError(
      data?.error?.code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'API_ERROR'),
      res.status,
      data?.error?.fields ?? [],
      data?.request_id,
    );
  }
  return data as T;
}

/** Ro'yxat javoblari: { items: [...] } */
export type ListResponse<T> = { items: T[] };

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : '';
};
