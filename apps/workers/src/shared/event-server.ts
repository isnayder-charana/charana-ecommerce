import { createServer, type Server } from 'node:http';

/** Lo que hace una Lambda con el evento que recibe (SQS, DynamoDB Streams…). */
export type EventHandler = (event: unknown) => Promise<unknown>;

/**
 * Servidor HTTP mínimo para el Lambda Web Adapter (paso 31).
 *
 * El adaptador recibe el evento de Lambda (un lote de SQS, de DynamoDB Streams…)
 * y lo reenvía tal cual como POST /events. Lo que respondemos vuelve a Lambda
 * como resultado de la invocación (por ejemplo, `batchItemFailures`).
 *
 *   GET  /health  → 200 cuando el worker está listo (el adaptador espera esto)
 *   POST /events  → ejecuta el manejador con el cuerpo y responde su resultado
 */
export function createEventServer(handler: EventHandler): Server {
  return createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && req.url === '/health') return reply(200, { status: 'ok' });
    if (req.method !== 'POST' || req.url !== '/events') return reply(404, { error: 'no existe' });

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const event: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      reply(200, (await handler(event)) ?? {});
    } catch (error) {
      // Un 500 hace que Lambda marque la invocación como fallida: el lote se reintenta.
      console.error(`Error procesando el evento: ${(error as Error).message}`);
      reply(500, { error: (error as Error).message });
    }
  });
}
