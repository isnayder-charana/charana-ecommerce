import type { AddressInfo } from 'node:net';
import { createEventServer, type EventHandler } from './event-server.js';

async function withServer(handler: EventHandler, run: (url: string) => Promise<void>) {
  const server = createEventServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Servidor de eventos (Lambda Web Adapter)', () => {
  it('GET /health responde 200: el adaptador sabe que el worker está listo', async () => {
    await withServer(
      async () => ({}),
      async (url) => {
        const res = await fetch(`${url}/health`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
      },
    );
  });

  it('POST /events entrega el evento al worker y devuelve su respuesta', async () => {
    const received: unknown[] = [];
    const handler: EventHandler = async (event) => {
      received.push(event);
      return { batchItemFailures: [{ itemIdentifier: 'm-2' }] };
    };

    await withServer(handler, async (url) => {
      const res = await fetch(`${url}/events`, {
        method: 'POST',
        body: JSON.stringify({ Records: [{ messageId: 'm-1' }] }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ batchItemFailures: [{ itemIdentifier: 'm-2' }] });
    });
    expect(received).toEqual([{ Records: [{ messageId: 'm-1' }] }]);
  });

  it('si el worker lanza, responde 500 (Lambda reintenta el lote)', async () => {
    const error = console.error;
    console.error = () => undefined;
    try {
      await withServer(
        async () => {
          throw new Error('se cayó');
        },
        async (url) => {
          const res = await fetch(`${url}/events`, { method: 'POST', body: '{}' });
          expect(res.status).toBe(500);
          expect(await res.json()).toEqual({ error: 'se cayó' });
        },
      );
    } finally {
      console.error = error;
    }
  });

  it('cualquier otra ruta es 404', async () => {
    await withServer(
      async () => ({}),
      async (url) => {
        expect((await fetch(`${url}/otra`)).status).toBe(404);
      },
    );
  });
});
