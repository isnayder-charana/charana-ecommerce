/**
 * Algo que ya pasó en el negocio ("OrderPlaced", "StockReserved").
 * En la fase 3 estos eventos se publicarán en EventBridge.
 */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
}
