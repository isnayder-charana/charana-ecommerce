import {
  DeleteMessageBatchCommand,
  type Message,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { SQSRecord } from 'aws-lambda';
import type { Logger } from './logger.js';
import type { SqsHandler } from './sqs-handler.js';

/**
 * Hace en tu PC lo que en AWS hace Lambda por nosotros (el "event source
 * mapping"): pide mensajes a la cola, se los pasa al manejador en un lote y
 * borra los que salieron bien. Los que fallaron NO se borran: vuelven a la
 * cola cuando vence su visibility timeout (30 s) y, al tercer intento, SQS los
 * mueve a la DLQ.
 */
export class SqsPoller {
  constructor(
    private readonly sqs: Pick<SQSClient, 'send'>,
    private readonly queueUrl: string,
    private readonly handler: SqsHandler,
    private readonly logger: Logger,
    /** Long polling: SQS espera hasta 20 s a que llegue algo antes de responder vacío. */
    private readonly waitTimeSeconds = 20,
  ) {}

  /** Una vuelta: recibe hasta 10 mensajes, los procesa y borra los buenos. */
  async pollOnce(signal?: AbortSignal): Promise<{ received: number; failed: number }> {
    const { Messages = [] } = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: this.waitTimeSeconds,
        MessageSystemAttributeNames: ['All'],
      }),
      { abortSignal: signal },
    );
    if (Messages.length === 0) return { received: 0, failed: 0 };

    const { batchItemFailures } = await this.handler({
      Records: Messages.map((m) => this.toRecord(m)),
    });
    const failed = new Set(batchItemFailures.map((f) => f.itemIdentifier));
    const done = Messages.filter((m) => !failed.has(m.MessageId ?? ''));

    if (done.length > 0) {
      await this.sqs.send(
        new DeleteMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: done.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle })),
        }),
      );
    }
    return { received: Messages.length, failed: failed.size };
  }

  /** Repite `pollOnce` hasta que se cancele `signal` (Ctrl+C). */
  async run(signal: AbortSignal, retryDelayMs = 5000): Promise<void> {
    let failing = false;
    while (!signal.aborted) {
      try {
        await this.pollOnce(signal);
        if (failing) this.logger.info('La cola volvió a responder');
        failing = false;
      } catch (error) {
        if (signal.aborted) return;
        // Por ejemplo, LocalStack apagado. Avisamos una vez y reintentamos con calma.
        if (!failing) {
          this.logger.error(
            `No se pudo leer la cola (se reintentará): ${(error as Error).message}`,
          );
        }
        failing = true;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  /** Arma el registro con la misma forma que el que Lambda entrega desde SQS. */
  private toRecord(message: Message): SQSRecord {
    const attrs = message.Attributes ?? {};
    return {
      messageId: message.MessageId ?? '',
      receiptHandle: message.ReceiptHandle ?? '',
      body: message.Body ?? '',
      attributes: {
        ApproximateReceiveCount: attrs.ApproximateReceiveCount ?? '1',
        SentTimestamp: attrs.SentTimestamp ?? '',
        SenderId: attrs.SenderId ?? '',
        ApproximateFirstReceiveTimestamp: attrs.ApproximateFirstReceiveTimestamp ?? '',
      },
      messageAttributes: {},
      md5OfBody: message.MD5OfBody ?? '',
      eventSource: 'aws:sqs',
      eventSourceARN: this.queueUrl,
      awsRegion: '',
    };
  }
}
