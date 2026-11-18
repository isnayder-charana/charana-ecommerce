import type { SNSClient } from '@aws-sdk/client-sns';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SnsAlertPublisher } from './sns-alert-publisher.js';
import { SqsQueueDepth } from './sqs-queue-depth.js';

type Command = { constructor: { name: string }; input: Record<string, unknown> };

/** Cliente AWS falso: responde según el nombre del comando y guarda lo que recibe. */
function fakeClient<T>(responses: Record<string, object>) {
  const commands: Command[] = [];
  const client = {
    send: async (command: Command) => {
      commands.push(command);
      return responses[command.constructor.name] ?? {};
    },
  } as unknown as T;
  return { client, commands };
}

describe('SqsQueueDepth', () => {
  it('cuenta los mensajes con ApproximateNumberOfMessages y pide la URL una sola vez', async () => {
    const { client, commands } = fakeClient<Pick<SQSClient, 'send'>>({
      GetQueueUrlCommand: { QueueUrl: 'url-dlq' },
      GetQueueAttributesCommand: { Attributes: { ApproximateNumberOfMessages: '3' } },
    });
    const depth = new SqsQueueDepth(client);

    expect(await depth.count('mi-dlq')).toBe(3);
    expect(await depth.count('mi-dlq')).toBe(3);
    expect(commands.map((c) => c.constructor.name)).toEqual([
      'GetQueueUrlCommand',
      'GetQueueAttributesCommand',
      'GetQueueAttributesCommand',
    ]);
    expect(commands[1]?.input).toEqual({
      QueueUrl: 'url-dlq',
      AttributeNames: ['ApproximateNumberOfMessages'],
    });
  });

  it('sin el atributo cuenta 0; si la cola no existe, falla', async () => {
    const vacia = fakeClient<Pick<SQSClient, 'send'>>({
      GetQueueUrlCommand: { QueueUrl: 'url' },
    });
    expect(await new SqsQueueDepth(vacia.client).count('x')).toBe(0);

    const sinCola = fakeClient<Pick<SQSClient, 'send'>>({});
    await expect(new SqsQueueDepth(sinCola.client).count('x')).rejects.toThrow(
      'No existe la cola x',
    );
  });
});

describe('SnsAlertPublisher', () => {
  it('publica en el tema con asunto y mensaje, y busca el ARN una sola vez', async () => {
    const { client, commands } = fakeClient<Pick<SNSClient, 'send'>>({
      CreateTopicCommand: { TopicArn: 'arn:alertas' },
    });
    const alerts = new SnsAlertPublisher(client, 'charanatech-alerts');

    await alerts.publish({ subject: 'Asunto', message: 'Mensaje' });
    await alerts.publish({ subject: 'Otro', message: 'Más' });

    expect(commands.map((c) => c.constructor.name)).toEqual([
      'CreateTopicCommand',
      'PublishCommand',
      'PublishCommand',
    ]);
    expect(commands[0]?.input).toEqual({ Name: 'charanatech-alerts' });
    expect(commands[1]?.input).toEqual({
      TopicArn: 'arn:alertas',
      Subject: 'Asunto',
      Message: 'Mensaje',
    });
  });

  it('falla con un mensaje claro si SNS no devuelve el ARN', async () => {
    const { client } = fakeClient<Pick<SNSClient, 'send'>>({});
    await expect(
      new SnsAlertPublisher(client, 'charanatech-alerts').publish({ subject: 's', message: 'm' }),
    ).rejects.toThrow('SNS no devolvió el ARN de charanatech-alerts');
  });
});
