import { memoryLogger, sqsBody } from '../../test/support/fixtures.js';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { SqsHandler } from './sqs-handler.js';
import { SqsPoller } from './sqs-poller.js';

type Command = { constructor: { name: string }; input: Record<string, unknown> };

/** SQS de prueba: responde con `batches` (uno por ReceiveMessage) y guarda los comandos. */
function fakeSqs(batches: (object[] | Error)[]) {
  const commands: Command[] = [];
  const client = {
    send: async (command: Command) => {
      commands.push(command);
      if (command.constructor.name === 'ReceiveMessageCommand') {
        const next = batches.shift() ?? [];
        if (next instanceof Error) throw next;
        return { Messages: next };
      }
      return {};
    },
  } as unknown as Pick<SQSClient, 'send'>;
  return { client, commands };
}

const message = (id: string, receiveCount = '1') => ({
  MessageId: id,
  ReceiptHandle: `rh-${id}`,
  Body: sqsBody(),
  Attributes: { ApproximateReceiveCount: receiveCount },
});

describe('SqsPoller (el corredor local)', () => {
  it('pasa el lote al manejador y borra solo los mensajes que salieron bien', async () => {
    const { client, commands } = fakeSqs([[message('m-1'), message('m-2', '3')]]);
    const received: string[][] = [];
    const handler: SqsHandler = async ({ Records }) => {
      received.push(Records.map((r) => `${r.messageId}:${r.attributes.ApproximateReceiveCount}`));
      return { batchItemFailures: [{ itemIdentifier: 'm-2' }] };
    };

    const result = await new SqsPoller(client, 'url-cola', handler, memoryLogger()).pollOnce();

    expect(result).toEqual({ received: 2, failed: 1 });
    expect(received).toEqual([['m-1:1', 'm-2:3']]);
    expect(commands[0]!.input).toMatchObject({
      QueueUrl: 'url-cola',
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    });
    expect(commands[1]!.constructor.name).toBe('DeleteMessageBatchCommand');
    expect(commands[1]!.input.Entries).toEqual([{ Id: '0', ReceiptHandle: 'rh-m-1' }]);
  });

  it('si todo falla no borra nada; si la cola está vacía no llama al manejador', async () => {
    const { client, commands } = fakeSqs([[message('m-1')], []]);
    let calls = 0;
    const handler: SqsHandler = async ({ Records }) => {
      calls++;
      return { batchItemFailures: Records.map((r) => ({ itemIdentifier: r.messageId })) };
    };
    const poller = new SqsPoller(client, 'url-cola', handler, memoryLogger());

    await poller.pollOnce();
    expect(await poller.pollOnce()).toEqual({ received: 0, failed: 0 });

    expect(calls).toBe(1);
    expect(commands.map((c) => c.constructor.name)).toEqual([
      'ReceiveMessageCommand',
      'ReceiveMessageCommand',
    ]);
  });

  it('sigue intentando si la cola no responde, avisa una vez y para con la señal', async () => {
    const stop = new AbortController();
    const { client } = fakeSqs([new Error('sin red'), new Error('sin red'), []]);
    const logger = memoryLogger();
    const handler: SqsHandler = async () => ({ batchItemFailures: [] });
    const poller = new SqsPoller(client, 'url-cola', handler, logger, 0);
    const original = poller.pollOnce.bind(poller);
    let polls = 0;
    poller.pollOnce = async (signal) => {
      if (++polls === 3) stop.abort();
      return original(signal);
    };

    await poller.run(stop.signal, 1);

    expect(polls).toBe(3);
    expect(logger.lines).toEqual([
      'ERROR No se pudo leer la cola (se reintentará): sin red',
      'La cola volvió a responder',
    ]);
  });

  it('si se cancela mientras espera, termina sin avisar error', async () => {
    const stop = new AbortController();
    const logger = memoryLogger();
    const client = {
      send: async () => {
        stop.abort();
        throw new Error('aborted');
      },
    } as unknown as Pick<SQSClient, 'send'>;
    const handler: SqsHandler = async () => ({ batchItemFailures: [] });

    await new SqsPoller(client, 'url-cola', handler, logger).run(stop.signal);

    expect(logger.lines).toEqual([]);
  });
});
