/**
 * PUERTO: qué eventos ya procesó cada worker.
 *
 * El outbox de la API entrega "al menos una vez", y SQS también: un mismo evento
 * puede llegar dos veces. Antes de actuar, el worker pregunta si ya lo hizo.
 * La clave incluye el nombre del worker, porque el mismo evento OrderPaid lo
 * procesan `notifications` y `fulfillment`, cada uno por su lado.
 */
export interface ProcessedEventStore {
  has(consumer: string, eventId: string): Promise<boolean>;
  record(consumer: string, eventId: string): Promise<void>;
}

/** ADAPTADOR en memoria, para los tests. */
export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly keys = new Set<string>();

  async has(consumer: string, eventId: string): Promise<boolean> {
    return this.keys.has(`${consumer}#${eventId}`);
  }

  async record(consumer: string, eventId: string): Promise<void> {
    this.keys.add(`${consumer}#${eventId}`);
  }
}
