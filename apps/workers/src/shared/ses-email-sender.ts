import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { Email, EmailSender } from './email.js';
import type { WorkersEnv } from './env.js';

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

/** Cliente de SES según las variables de entorno (LocalStack si hay SES_ENDPOINT). */
export function createEmailSender(env: WorkersEnv): SesEmailSender {
  const ses = new SESClient({
    region: env.AWS_REGION,
    endpoint: env.SES_ENDPOINT,
    ...(env.SES_ENDPOINT && { credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }),
  });
  return new SesEmailSender(ses, env.EMAIL_FROM);
}
