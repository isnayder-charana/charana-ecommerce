import type { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { maskEmail } from './email.js';
import { loadEnv } from './env.js';
import { memoryLogger } from '../../test/support/fixtures.js';
import { createEmailSender, LoggingEmailSender, SesEmailSender } from './ses-email-sender.js';

describe('SesEmailSender', () => {
  it('envía con SES desde el remitente verificado, en UTF-8, con texto y HTML', async () => {
    const commands: SendEmailCommand[] = [];
    const ses = {
      send: async (command: SendEmailCommand) => {
        commands.push(command);
        return {};
      },
    } as unknown as Pick<SESClient, 'send'>;

    await new SesEmailSender(ses, 'no-reply@charanatech.local').send({
      to: 'ana@correo.com',
      subject: 'Hola',
      text: 'texto',
      html: '<p>html</p>',
    });

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

  it('se crea desde las variables de entorno (con y sin LocalStack)', () => {
    expect(createEmailSender(loadEnv({ SES_ENDPOINT: 'http://localhost:4566' }))).toBeInstanceOf(
      SesEmailSender,
    );
    expect(createEmailSender(loadEnv({}))).toBeInstanceOf(SesEmailSender);
  });
});

describe('maskEmail', () => {
  it('oculta el usuario del correo', () => {
    expect(maskEmail('ana.maria@correo.com')).toBe('a***@correo.com');
    expect(maskEmail('raro')).toBe('r***@');
  });

  it('con EMAIL_DELIVERY=log no envía: deja el asunto y el correo enmascarado en el log', async () => {
    const logger = memoryLogger();
    const sender = createEmailSender(loadEnv({ EMAIL_DELIVERY: 'log' }), logger);
    expect(sender).toBeInstanceOf(LoggingEmailSender);

    await sender.send({
      to: 'ana.maria@correo.com',
      subject: 'Pago confirmado',
      text: '',
      html: '',
    });

    expect(logger.lines).toEqual([
      '[sin enviar: EMAIL_DELIVERY=log] "Pago confirmado" para a***@correo.com',
    ]);
  });
});
