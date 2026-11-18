import type { DomainEvent } from './domain-event.js';
import { Entity } from './entity.js';

/**
 * Raíz de agregado: la única puerta de entrada a un grupo de objetos
 * que deben mantenerse consistentes juntos (p. ej. un pedido y sus líneas).
 * Acumula los eventos de dominio hasta que la aplicación los publica.
 */
export abstract class AggregateRoot<TId extends string> extends Entity<TId> {
  private domainEvents: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = this.domainEvents;
    this.domainEvents = [];
    return events;
  }
}
