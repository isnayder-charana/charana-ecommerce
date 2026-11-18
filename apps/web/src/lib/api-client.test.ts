import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jsonResponse } from '@/test/fixtures';
import { API_URL, ApiError, apiGet, apiRequest } from './api-client';

const schema = z.object({ status: z.string() });

describe('apiGet', () => {
  it('devuelve la respuesta validada y arma la URL con los filtros', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiGet('/health', schema, { q: 'usb', page: 2, empty: '', none: undefined }),
    ).resolves.toEqual({
      status: 'ok',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${API_URL}/health?q=usb&page=2`);
  });

  it('convierte un error de la API en ApiError con su código', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ statusCode: 404, code: 'PRODUCT_NOT_FOUND', message: 'No existe' }, 404),
        ),
    );

    const error = await apiGet('/products/x', schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND', message: 'No existe' });
  });

  it('si el error no trae cuerpo JSON usa un mensaje genérico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
    await expect(apiGet('/x', schema)).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('falla si la API cambia la forma de los datos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ estado: 'ok' })));
    await expect(apiGet('/health', schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe('apiRequest', () => {
  it('envía el cuerpo como JSON y el token en Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/orders', schema, {
      method: 'POST',
      body: { a: 1 },
      token: 'abc',
      headers: { 'X-Id-Token': 'id' },
    });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer abc',
      'X-Id-Token': 'id',
      'Content-Type': 'application/json',
    });
  });

  it('sin token ni cuerpo no agrega esas cabeceras', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/health', schema);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });
});
