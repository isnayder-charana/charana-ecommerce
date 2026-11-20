import { type EmailSender, maskEmail } from '../shared/email.js';
import type { Logger } from '../shared/logger.js';
import type { OrderEventHandler } from '../shared/sqs-handler.js';
import { orderEmail } from './order-email.js';

export interface NotifyCustomerDeps {
  emails: EmailSender;
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
    if ((await emails.send(email)) === 'sent') {
      logger.info(`Correo "${email.subject}" enviado a ${maskEmail(email.to)}`);
    }
  };
}
