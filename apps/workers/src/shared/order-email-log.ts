/** Un correo de un pedido, tal como lo verá el cliente en la página del pedido. */
export interface OrderEmailRecord {
  orderId: string;
  /** Id del evento que lo originó: un evento repetido sobrescribe el mismo registro. */
  eventId: string;
  occurredAt: string;
  subject: string;
  text: string;
  /** true si SES lo entregó; false si se omitió (sandbox o modo log). */
  delivered: boolean;
}

/**
 * PUERTO: guarda una copia de cada correo de un pedido.
 *
 * Con SES en sandbox, un reclutador con un correo sin verificar no recibe nada.
 * Con esta copia, la página del pedido le muestra "el correo que te habríamos enviado".
 */
export interface OrderEmailLog {
  record(email: OrderEmailRecord): Promise<void>;
}

/** ADAPTADOR en memoria, para los tests. */
export class InMemoryOrderEmailLog implements OrderEmailLog {
  readonly records: OrderEmailRecord[] = [];

  async record(email: OrderEmailRecord): Promise<void> {
    const index = this.records.findIndex((r) => r.eventId === email.eventId);
    if (index >= 0) this.records[index] = email;
    else this.records.push(email);
  }
}
