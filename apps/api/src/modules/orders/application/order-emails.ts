/**
 * Un correo que la tienda le mandó (o le habría mandado) al cliente por su pedido.
 * Lo escribe el worker `notifications` al enviar; la API solo lo lee.
 */
export interface OrderEmailView {
  subject: string;
  text: string;
  /** Cuándo pasó lo que avisa el correo (fecha del evento). */
  occurredAt: string;
  /**
   * true si SES lo entregó. false si se omitió: SES en sandbox solo envía a
   * correos verificados, así que la tienda muestra "el correo que te habríamos enviado".
   */
  delivered: boolean;
}

/** PUERTO: los correos de un pedido, del más antiguo al más nuevo. */
export interface OrderEmailsReader {
  findByOrder(orderId: string): Promise<OrderEmailView[]>;
}

export const ORDER_EMAILS_READER = Symbol('OrderEmailsReader');
