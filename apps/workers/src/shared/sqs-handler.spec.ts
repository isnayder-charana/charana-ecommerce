import { memoryLogger, orderEvent, sqsBody, sqsRecord } from '../../test/support/fixtures.js';
import type { OrderEvent } from './order-event.js';
import { InMemoryProcessedEventStore } from './processed-events.js';
import { createSqsHandler } from './sqs-handler.js';

describe('createSqsHandler', () => {
  const setup = (handle: (event: OrderEvent) => Promise<void>) => {
    const processed = new InMemoryProcessedEventStore();
    const logger = memoryLogger();
    const handler = createSqsHandler({ consumer: 'notifications', handle, processed, logger });
    return { handler, processed, logger };
  };

  it('procesa cada evento y lo anota como procesado', async () => {
    const seen: string[] = [];
    const { handler, processed, logger } = setup(async (e) => {
      seen.push(e.id);
    });

    const result = await handler({ Records: [sqsRecord('m-1', sqsBody())] });

    expect(result).toEqual({ batchItemFailures: [] });
    expect(seen).toEqual(['e-1']);
    expect(await processed.has('notifications', 'e-1')).toBe(true);
    expect(logger.lines).toEqual(['OrderPaid del pedido o-1 (evento e-1): procesado']);
  });

  it('ignora un evento repetido (idempotencia), aunque llegue en otro mensaje', async () => {
    let calls = 0;
    const { handler } = setup(async () => {
      calls++;
    });

    await handler({ Records: [sqsRecord('m-1', sqsBody()), sqsRecord('m-2', sqsBody())] });
    await handler({ Records: [sqsRecord('m-3', sqsBody())] });

    expect(calls).toBe(1);
  });

  it('la idempotencia es por worker: otro worker sí procesa el mismo evento', async () => {
    const processed = new InMemoryProcessedEventStore();
    await processed.record('fulfillment', 'e-1');
    expect(await processed.has('notifications', 'e-1')).toBe(false);
  });

  it('devuelve SOLO los mensajes que fallaron (partial batch response)', async () => {
    const { handler, processed, logger } = setup(async (e) => {
      if (e.orderId === 'o-malo') throw new Error('SES no responde');
    });

    const result = await handler({
      Records: [
        sqsRecord('m-ok', sqsBody()),
        sqsRecord('m-falla', sqsBody({ ...orderEvent, id: 'e-2', orderId: 'o-malo' }), '2'),
        sqsRecord('m-basura', 'no soy json'),
      ],
    });

    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: 'm-falla' },
      { itemIdentifier: 'm-basura' },
    ]);
    // El que falló NO queda anotado: el reintento lo volverá a intentar.
    expect(await processed.has('notifications', 'e-2')).toBe(false);
    expect(logger.lines).toContain('ERROR Mensaje m-falla falló (intento 2): SES no responde');
    expect(logger.lines).toContain(
      'ERROR Mensaje m-basura mensaje inválido (intento 1): El mensaje no es JSON',
    );
  });
});
