import { MessageRejected, SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { type Email, type EmailOutcome, type EmailSender, maskEmail } from './email.js';
import type { WorkersEnv } from './env.js';
import { consoleLogger, type Logger } from './logger.js';

/**
 * ADAPTADOR: envía con Amazon SES (API v1, la que incluye LocalStack gratis).
 * El remitente (`from`) debe estar verificado en SES; en local lo verifica el
 * script de LocalStack (no-reply@charanatech.local).
 *
 * Sandbox de SES (paso 32): mientras la cuenta no tiene acceso de producción,
 * SES solo entrega a correos verificados y rechaza los demás con
 * MessageRejected. Ese rechazo no se arregla reintentando, así que se anota en
 * el log y el mensaje se da por procesado (no va a la DLQ). Si el rechazado es
 * el REMITENTE, en cambio, es un error de configuración: sube y salta la alarma.
 */
export class SesEmailSender implements EmailSender {
  constructor(
    private readonly ses: Pick<SESClient, 'send'>,
    private readonly from: string,
    private readonly logger: Logger = consoleLogger('correo'),
  ) {}

  async send(email: Email): Promise<EmailOutcome> {
    try {
      await this.deliver(email);
      return 'sent';
    } catch (error) {
      if (!this.isUnverifiedRecipient(error, email.to)) throw error;
      this.logger.info(
        `[sin enviar: SES en sandbox] ${maskEmail(email.to)} no está verificado; "${email.subject}" no se envía`,
      );
      return 'skipped';
    }
  }

  /** SES nombra en el mensaje las direcciones que no pasaron la verificación. */
  private isUnverifiedRecipient(error: unknown, to: string): boolean {
    if (!(error instanceof MessageRejected)) return false;
    const failed = error.message.toLowerCase();
    return failed.includes(to.toLowerCase()) && !failed.includes(this.from.toLowerCase());
  }

  private async deliver({ to, subject, text, html }: Email): Promise<void> {
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

  async send({ to, subject }: Email): Promise<EmailOutcome> {
    this.logger.info(`[sin enviar: EMAIL_DELIVERY=log] "${subject}" para ${maskEmail(to)}`);
    return 'skipped';
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
  return new SesEmailSender(ses, env.EMAIL_FROM, logger);
}
