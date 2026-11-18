import type { UseCase } from '../../../shared/application/use-case.js';
import type { EventPublisher, OutboxStore } from './order-events.js';

/** Cuántos eventos se leen de la bandeja por vuelta. */
export const OUTBOX_BATCH_SIZE = 25;

/**
 * El RELÉ del outbox: lee los eventos pendientes, los publica en el bus y,
 * SOLO si se publicaron, los quita de la bandeja.
 *
 * Garantía "al menos una vez": si la API se cae entre publicar y borrar, el
 * evento se publicará de nuevo en la siguiente vuelta. Por eso los
 * consumidores deben ser idempotentes (usan el id del evento).
 */
export class PublishOutboxUseCase implements UseCase<void, number> {
  constructor(
    private readonly outbox: OutboxStore,
    private readonly publisher: EventPublisher,
  ) {}

  /** Devuelve cuántos eventos publicó. */
  async execute(): Promise<number> {
    let published = 0;
    for (;;) {
      const batch = await this.outbox.pending(OUTBOX_BATCH_SIZE);
      if (batch.length === 0) return published;

      await this.publisher.publish(batch);
      await this.outbox.remove(batch);
      published += batch.length;

      if (batch.length < OUTBOX_BATCH_SIZE) return published;
    }
  }
}
