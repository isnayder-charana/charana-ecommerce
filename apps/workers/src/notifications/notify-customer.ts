import { type EmailSender, maskEmail } from '../shared/email.js';
import type { Logger } from '../shared/logger.js';
import type { OrderEmailLog } from '../shared/order-email-log.js';
import type { OrderEventHandler } from '../shared/sqs-handler.js';
import { orderEmail } from './order-email.js';

export interface NotifyCustomerDeps {
  emails: EmailSender;
  /** Copia de cada correo, para mostrarla en la página del pedido (paso 34). */
  history: OrderEmailLog;
  logger: Logger;
  /** Dirección de la tienda, para el enlace "Ver mi pedido". */
  storeUrl: string;
}

/**
 * Worker `notifications`: envía un correo al cliente en cada cambio de su pedido.
 * Si SES falla, el error sube: el mensaje se reintenta y, tras 3 fallos, va a la DLQ
 * (y la alarma del paso 32 te avisa por correo).
 */
export function notifyCustomer({
  emails,
  history,
  logger,
  storeUrl,
}: NotifyCustomerDeps): OrderEventHandler {
  return async (event) => {
    const email = orderEmail(event, storeUrl);
    if (!email) {
      if (!event.customerEmail) logger.info(`Pedido ${event.orderId} sin correo: no se avisa`);
      return;
    }
    // Si no se envió a propósito ("skipped"), el remitente ya dejó el motivo en el log.
    const outcome = await emails.send(email);
    if (outcome === 'sent') {
      logger.info(`Correo "${email.subject}" enviado a ${maskEmail(email.to)}`);
    }
    // Se guarda la copia aunque no se haya enviado: la tienda la muestra igual.
    // Si esto falla, el mensaje se reintenta y el correo podría llegar dos veces:
    // preferimos eso a que la página del pedido quede sin el correo.
    await history.record({
      orderId: event.orderId,
      eventId: event.id,
      occurredAt: event.occurredAt,
      subject: email.subject,
      text: email.text,
      delivered: outcome === 'sent',
    });
  };
}
