import { HttpOrdersApi } from './http-orders-api.js';

const KEY = 'k'.repeat(64);

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? 'no es json' : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('HttpOrdersApi', () => {
  it('llama a la ruta interna con la clave y devuelve el resultado', async () => {
    const { fetchFn, calls } = fakeFetch(200, { status: 'SHIPPED', changed: true });
    const api = new HttpOrdersApi('http://localhost:3000/api', KEY, fetchFn);

    expect(await api.fulfill('o-1', 'ship')).toEqual({ status: 'SHIPPED', changed: true });
    expect(calls[0]?.url).toBe('http://localhost:3000/api/internal/orders/o-1/fulfillment');
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': KEY },
      body: '{"step":"ship"}',
    });
  });

  it('cualquier respuesta que no sea 2xx es un error (para reintentar)', async () => {
    await expect(
      new HttpOrdersApi(
        'http://api',
        KEY,
        fakeFetch(409, { code: 'CONCURRENCY_CONFLICT' }).fetchFn,
      ).fulfill('o-1', 'deliver'),
    ).rejects.toThrow('La API respondió 409 (CONCURRENCY_CONFLICT)');
    await expect(
      new HttpOrdersApi('http://api', KEY, fakeFetch(502, undefined).fetchFn).fulfill(
        'o-1',
        'ship',
      ),
    ).rejects.toThrow('La API respondió 502 (sin código)');
  });
});
