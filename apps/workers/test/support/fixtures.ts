/** Datos y dobles de prueba compartidos por los tests de los workers. */
import type { Email, EmailOutcome, EmailSender } from '../../src/shared/email.js';
import type { OrdersApi } from '../../src/fulfillment/orders-api.js';
import type { SQSRecord } from 'aws-lambda';
import type { Logger } from '../../src/shared/logger.js';

/** Logger que guarda las líneas para revisarlas en los tests. */
export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (message) => lines.push(message),
    error: (message) => lines.push(`ERROR ${message}`),
  };
}

/** Un registro SQS como el que entrega Lambda. */
export function sqsRecord(messageId: string, body: string, attempt = '1'): SQSRecord {
  return {
    messageId,
    receiptHandle: `rh-${messageId}`,
    body,
    attributes: {
      ApproximateReceiveCount: attempt,
      SentTimestamp: '0',
      SenderId: 'x',
      ApproximateFirstReceiveTimestamp: '0',
    },
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-2:000000000000:cola',
    awsRegion: 'us-east-2',
  };
}

export const orderEvent = {
  id: 'e-1',
  type: 'OrderPaid',
  occurredAt: '2026-11-17T12:00:00.000Z',
  orderId: 'o-1',
  customerId: 'c-1',
  status: 'PAID',
  total: { cents: 5999, currency: 'USD' },
} as const;

/** El cuerpo que EventBridge deja en SQS: un sobre con el evento en `detail`. */
export const sqsBody = (detail: object = orderEvent) =>
  JSON.stringify({
    version: '0',
    id: 'eb-1',
    source: 'charanatech.orders',
    'detail-type': 'OrderPaid',
    time: '2026-11-17T12:00:00Z',
    detail,
  });

/** "Bandeja" de correos para los tests: guarda lo enviado y puede fallar a pedido. */
export class FakeEmailSender implements EmailSender {
  readonly sent: Email[] = [];
  failWith?: Error;

  /** Lo que responde el envío (por defecto, enviado). */
  outcome: EmailOutcome = 'sent';

  async send(email: Email): Promise<EmailOutcome> {
    if (this.failWith) throw this.failWith;
    this.sent.push(email);
    return this.outcome;
  }
}

/** API de pedidos falsa: anota los pasos pedidos y responde lo que digamos. */
export class FakeOrdersApi implements OrdersApi {
  readonly calls: string[] = [];
  changed = true;

  async fulfill(orderId: string, step: 'ship' | 'deliver') {
    this.calls.push(`${orderId}:${step}`);
    return { status: step === 'ship' ? 'SHIPPED' : 'DELIVERED', changed: this.changed };
  }
}
