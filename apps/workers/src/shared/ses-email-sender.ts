import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { type Email, type EmailSender, maskEmail } from './email.js';
import type { WorkersEnv } from './env.js';
import { consoleLogger, type Logger } from './logger.js';

/**
 * ADAPTADOR: envía con Amazon SES (API v1, la que incluye LocalStack gratis).
 * El remitente (`from`) debe estar verificado en SES; en local lo verifica el
 * script de LocalStack (no-reply@charanatech.local).
 */
export class SesEmailSender implements EmailSender {
  constructor(
    private readonly ses: Pick<SESClient, 'send'>,
    private readonly from: string,
  ) {}

  async send({ to, subject, text, html }: Email): Promise<void> {
    await this.ses.send(
      new SendEmailCommand({
        Source: `CharanaTech <${this.from}>`,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' },
          },
        },
      }),
    );
  }
}

/**
 * ADAPTADOR: no envía nada, solo deja constancia en el log. Lo usa la Lambda
 * mientras SES no tiene el remitente verificado (EMAIL_DELIVERY=log, paso 31):
 * así el worker funciona de punta a punta y los mensajes no terminan en la DLQ.
 */
export class LoggingEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  async send({ to, subject }: Email): Promise<void> {
    this.logger.info(`[sin enviar: EMAIL_DELIVERY=log] "${subject}" para ${maskEmail(to)}`);
  }
}

/**
 * El remitente según las variables de entorno: SES (LocalStack si hay
 * SES_ENDPOINT) o, con EMAIL_DELIVERY=log, solo el log.
 */
export function createEmailSender(
  env: WorkersEnv,
  logger: Logger = consoleLogger('correo'),
): EmailSender {
  if (env.EMAIL_DELIVERY === 'log') return new LoggingEmailSender(logger);
  const ses = new SESClient({
    region: env.AWS_REGION,
    endpoint: env.SES_ENDPOINT,
    ...(env.SES_ENDPOINT && { credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }),
  });
  return new SesEmailSender(ses, env.EMAIL_FROM);
}
