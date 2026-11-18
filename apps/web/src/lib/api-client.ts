import type { z } from 'zod';

/**
 * Dirección de la API. Las variables NEXT_PUBLIC_* se copian al código del navegador
 * al compilar, por eso nunca deben tener secretos.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

/** Error de la API con el formato del DomainErrorFilter: { statusCode, code, message }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | undefined>;

/**
 * GET a la API que además VALIDA la respuesta con un esquema Zod.
 * Si el backend cambia la forma de los datos, fallamos aquí con un error claro
 * y no con un "undefined" en medio de un componente.
 */
export async function apiGet<T extends z.ZodType>(
  path: string,
  schema: T,
  query: Query = {},
  init?: RequestInit,
): Promise<z.infer<T>> {
  return apiRequest(path, schema, { query, signal: init?.signal ?? undefined });
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  query?: Query;
  /** Se envía como JSON. */
  body?: unknown;
  /** Access token de la sesión: va en la cabecera Authorization. */
  token?: string | null;
  /** Cabeceras extra (por ejemplo X-Id-Token al crear un pedido). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Cualquier petición a la API (con o sin sesión), con la respuesta validada por Zod. */
export async function apiRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  { method = 'GET', query = {}, body, token, headers: extra, signal }: ApiRequestOptions = {},
): Promise<z.infer<T>> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { ...extra, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = json as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `La API respondió ${response.status}`,
    );
  }

  return schema.parse(json);
}
