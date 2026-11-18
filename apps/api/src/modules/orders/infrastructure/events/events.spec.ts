import type { PutEventsCommand, PutEventsCommandOutput } from '@aws-sdk/client-eventbridge';
import { Logger } from '@nestjs/common';
import type { OrderEvent } from '../../application/order-events.js';
import type { PublishOutboxUseCase } from '../../application/publish-outbox.use-case.js';
import { EventBridgePublisher, ORDER_EVENTS_SOURCE } from './eventbridge-event.publisher.js';
import { LoggingEventPublisher } from './logging-event.publisher.js';
import { OutboxRelayService } from './outbox-relay.service.js';

const event = (i: number): OrderEvent => ({
  id: `e-${i}`,
  type: 'OrderPaid',
  occurredAt: '2026-11-10T12:00:00.000Z',
  orderId: `o-${i}`,
  customerId: 'c-1',
  status: 'PAID',
  total: { cents: 5999, currency: 'USD' },
});

/** Cliente de EventBridge de prueba: guarda cada PutEvents y responde lo que le digamos. */
function fakeClient(response: Partial<PutEventsCommandOutput> = { FailedEntryCount: 0 }) {
  const calls: PutEventsCommand[] = [];
  const client = {
    send: async (command: PutEventsCommand) => {
      calls.push(command);
      return response;
    },
  };
  return { client: client as never, calls };
}

describe('EventBridgePublisher', () => {
  it('publica en el bus con source charanatech.orders y detail-type = tipo, de 10 en 10', async () => {
    const { client, calls } = fakeClient();
    await new EventBridgePublisher(client, 'charanatech').publish(
      Array.from({ length: 12 }, (_, i) => event(i)),
    );

    expect(calls.map((c) => c.input.Entries?.length)).toEqual([10, 2]);
    const first = calls[0]!.input.Entries![0]!;
    expect(first).toMatchObject({
      EventBusName: 'charanatech',
      Source: ORDER_EVENTS_SOURCE,
      DetailType: 'OrderPaid',
      Time: new Date('2026-11-10T12:00:00.000Z'),
    });
    expect(JSON.parse(first.Detail!)).toEqual(event(0));
  });

  it('lanza error si EventBridge rechaza alguna entrada (aunque no lance él)', async () => {
    const { client } = fakeClient({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalFailure', ErrorMessage: 'ups' }],
    });
    await expect(
      new EventBridgePublisher(client, 'charanatech').publish([event(1)]),
    ).rejects.toThrow('EventBridge rechazó 1 evento(s): ups');
  });
});

describe('LoggingEventPublisher', () => {
  it('escribe cada evento en el log', async () => {
    const lines: string[] = [];
    const original = Logger.prototype.log;
    Logger.prototype.log = (message: string) => {
      lines.push(message);
    };
    try {
      await new LoggingEventPublisher().publish([event(1)]);
    } finally {
      Logger.prototype.log = original;
    }
    expect(lines).toEqual(['OrderPaid del pedido o-1 (evento e-1)']);
  });
});

describe('OutboxRelayService', () => {
  let warnings: string[];
  const originalWarn = Logger.prototype.warn;
  const originalLog = Logger.prototype.log;

  beforeEach(() => {
    warnings = [];
    Logger.prototype.warn = (message: string) => {
      warnings.push(message);
    };
    Logger.prototype.log = () => undefined;
  });
  afterEach(() => {
    Logger.prototype.warn = originalWarn;
    Logger.prototype.log = originalLog;
  });

  /** Relé de prueba: cuenta las vueltas; `results` dice qué devuelve (o lanza) cada una. */
  const relayWith = (...results: (number | Error)[]) => {
    let calls = 0;
    const publishOutbox = {
      execute: async () => {
        const result = results[calls++] ?? 0;
        if (result instanceof Error) throw result;
        return result;
      },
    } as unknown as PublishOutboxUseCase;
    return { publishOutbox, calls: () => calls };
  };

  it('avisa una sola vez por racha de fallos y se recupera', async () => {
    const { publishOutbox, calls } = relayWith(new Error('sin red'), new Error('sin red'), 2);
    const service = new OutboxRelayService(publishOutbox, 0);

    await service.tick();
    await service.tick();
    await service.tick();

    expect(calls()).toBe(3);
    expect(warnings).toEqual(['No se pudo publicar (se reintentará): sin red']);
  });

  it('no arranca una vuelta si la anterior sigue en curso', async () => {
    let release!: () => void;
    let calls = 0;
    const publishOutbox = {
      execute: () => {
        calls++;
        return new Promise<number>((resolve) => {
          release = () => resolve(0);
        });
      },
    } as unknown as PublishOutboxUseCase;
    const service = new OutboxRelayService(publishOutbox, 0);

    const first = service.tick();
    await service.tick();
    release();
    await first;

    expect(calls).toBe(1);
  });

  it('con intervalo 0 no programa nada; con intervalo, corre solo y se detiene al cerrar', async () => {
    const off = relayWith();
    const disabled = new OutboxRelayService(off.publishOutbox, 0);
    disabled.onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 30));
    disabled.onModuleDestroy();
    expect(off.calls()).toBe(0);

    const on = relayWith();
    const service = new OutboxRelayService(on.publishOutbox, 5);
    service.onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 40));
    service.onModuleDestroy();
    const afterStop = on.calls();
    expect(afterStop).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(on.calls()).toBe(afterStop);
  });
});
