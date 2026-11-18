import { CreateTopicCommand, PublishCommand, type SNSClient } from '@aws-sdk/client-sns';
import type { Alert, AlertPublisher } from '../alerts/dlq-monitor.js';

/**
 * ADAPTADOR: publica el aviso en el tema SNS `charanatech-alerts`. SNS lo
 * reparte a quien esté suscrito: en tu PC, la cola espía `charanatech-alerts-log`;
 * en AWS (fase 4), el correo del administrador.
 */
export class SnsAlertPublisher implements AlertPublisher {
  private topicArn?: string;

  constructor(
    private readonly sns: Pick<SNSClient, 'send'>,
    private readonly topicName: string,
  ) {}

  async publish({ subject, message }: Alert): Promise<void> {
    await this.sns.send(
      new PublishCommand({ TopicArn: await this.arn(), Subject: subject, Message: message }),
    );
  }

  /** CreateTopic es idempotente: si el tema ya existe, solo devuelve su ARN. */
  private async arn(): Promise<string> {
    if (!this.topicArn) {
      const { TopicArn } = await this.sns.send(new CreateTopicCommand({ Name: this.topicName }));
      if (!TopicArn) throw new Error(`SNS no devolvió el ARN de ${this.topicName}`);
      this.topicArn = TopicArn;
    }
    return this.topicArn;
  }
}
