import type { ProcessedEventStore } from '../../application/payment-event.js';

/** ADAPTADOR en memoria de los avisos ya procesados. */
export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly ids = new Set<string>();

  async has(eventId: string): Promise<boolean> {
    return this.ids.has(eventId);
  }

  async record(eventId: string): Promise<void> {
    this.ids.add(eventId);
  }
}
