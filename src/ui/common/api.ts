import { signal } from '@preact/signals';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** Set when any call returns 401 so the app can show the login screen. */
export const unauthorized = signal(false);

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Calls the panel API relative to the current document (works under the secret path). */
export async function api<T = unknown>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'x-nexadib': '1',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && data.error === 'unauthorized') unauthorized.value = true;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'http_error'), data);
  return data as T;
}
