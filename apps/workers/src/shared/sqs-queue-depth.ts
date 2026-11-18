import { GetQueueAttributesCommand, GetQueueUrlCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { QueueDepth } from '../alerts/dlq-monitor.js';

/**
 * ADAPTADOR: cuenta los mensajes de una cola con SQS. `ApproximateNumberOfMessages`
 * es la misma métrica que en AWS mira la alarma de CloudWatch.
 */
export class SqsQueueDepth implements QueueDepth {
  private readonly urls = new Map<string, string>();

  constructor(private readonly sqs: Pick<SQSClient, 'send'>) {}

  async count(queueName: string): Promise<number> {
    const { Attributes } = await this.sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: await this.url(queueName),
        AttributeNames: ['ApproximateNumberOfMessages'],
      }),
    );
    return Number(Attributes?.ApproximateNumberOfMessages ?? 0);
  }

  /** La URL de cada cola se pide una sola vez. */
  private async url(queueName: string): Promise<string> {
    const cached = this.urls.get(queueName);
    if (cached) return cached;
    const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (!QueueUrl) throw new Error(`No existe la cola ${queueName}`);
    this.urls.set(queueName, QueueUrl);
    return QueueUrl;
  }
}
