import { MessageRejected, type SendEmailCommand, type SESClient } from '@aws-sdk/client-ses';
import { memoryLogger } from '../../test/support/fixtures.js';
import { type Email, maskEmail } from './email.js';
import { loadEnv } from './env.js';
import { createEmailSender, LoggingEmailSender, SesEmailSender } from './ses-email-sender.js';

const email: Email = {
  to: 'ana@correo.com',
  subject: 'Hola',
  text: 'texto',
  html: '<p>html</p>',
};

/** SES falso: guarda los comandos y, si se pide, falla con el error dado. */
function fakeSes(failWith?: Error) {
  const commands: SendEmailCommand[] = [];
  const ses = {
    send: async (command: SendEmailCommand) => {
      commands.push(command);
      if (failWith) throw failWith;
      return {};
    },
  } as unknown as Pick<SESClient, 'send'>;
  return { ses, commands };
}

/** El rechazo que da SES cuando una dirección no está verificada (sandbox). */
const notVerified = (...addresses: string[]) =>
  new MessageRejected({
    message: `Email address is not verified. The following identities failed the check in region US-EAST-2: ${addresses.join(', ')}`,
    $metadata: {},
  });

describe('SesEmailSender', () => {
  it('envía con SES desde el remitente verificado, en UTF-8, con texto y HTML', async () => {
    const { ses, commands } = fakeSes();

    const outcome = await new SesEmailSender(ses, 'no-reply@charanatech.local').send(email);

    expect(outcome).toBe('sent');
    expect(commands[0]?.input).toEqual({
      Source: 'CharanaTech <no-reply@charanatech.local>',
      Destination: { ToAddresses: ['ana@correo.com'] },
      Message: {
        Subject: { Data: 'Hola', Charset: 'UTF-8' },
        Body: {
          Text: { Data: 'texto', Charset: 'UTF-8' },
          Html: { Data: '<p>html</p>', Charset: 'UTF-8' },
        },
      },
    });
  });

  it('en sandbox, un destinatario sin verificar no es un error: se anota y no se reintenta', async () => {
    const { ses } = fakeSes(notVerified('Ana@Correo.com'));
    const logger = memoryLogger();

    const outcome = await new SesEmailSender(ses, 'tienda@correo.com', logger).send(email);

    expect(outcome).toBe('skipped');
    expect(logger.lines).toEqual([
      '[sin enviar: SES en sandbox] a***@correo.com no está verificado; "Hola" no se envía',
    ]);
  });

  it('si el rechazado es el remitente, el error sube (configuración rota: DLQ y alarma)', async () => {
    const { ses } = fakeSes(notVerified('tienda@correo.com', 'ana@correo.com'));

    await expect(new SesEmailSender(ses, 'tienda@correo.com').send(email)).rejects.toThrow(
      'not verified',
    );
  });

  it('cualquier otro error de SES sube para que el mensaje se reintente', async () => {
    const { ses } = fakeSes(new Error('ThrottlingException'));

    await expect(new SesEmailSender(ses, 'tienda@correo.com').send(email)).rejects.toThrow(
      'ThrottlingException',
    );
  });

  it('se crea desde las variables de entorno (con y sin LocalStack)', () => {
    expect(createEmailSender(loadEnv({ SES_ENDPOINT: 'http://localhost:4566' }))).toBeInstanceOf(
      SesEmailSender,
    );
    expect(createEmailSender(loadEnv({}))).toBeInstanceOf(SesEmailSender);
  });
});

describe('LoggingEmailSender', () => {
  it('con EMAIL_DELIVERY=log no envía: deja el asunto y el correo enmascarado en el log', async () => {
    const logger = memoryLogger();
    const sender = createEmailSender(loadEnv({ EMAIL_DELIVERY: 'log' }), logger);
    expect(sender).toBeInstanceOf(LoggingEmailSender);

    const outcome = await sender.send({ ...email, to: 'ana.maria@correo.com', subject: 'Pago' });

    expect(outcome).toBe('skipped');
    expect(logger.lines).toEqual(['[sin enviar: EMAIL_DELIVERY=log] "Pago" para a***@correo.com']);
  });
});

describe('maskEmail', () => {
  it('oculta el usuario del correo', () => {
    expect(maskEmail('ana.maria@correo.com')).toBe('a***@correo.com');
    expect(maskEmail('raro')).toBe('r***@');
  });
});
