import { Logger } from '@nestjs/common';
import type { EventPublisher, OrderEvent } from '../../application/order-events.js';

/**
 * ADAPTADOR para desarrollo sin LocalStack (PERSISTENCE=memory): en vez de
 * publicar, escribe cada evento en el log de la API.
 */
export class LoggingEventPublisher implements EventPublisher {
  private readonly logger = new Logger('Eventos');

  async publish(events: OrderEvent[]): Promise<void> {
    for (const event of events) {
      this.logger.log(`${event.type} del pedido ${event.orderId} (evento ${event.id})`);
    }
  }
}
