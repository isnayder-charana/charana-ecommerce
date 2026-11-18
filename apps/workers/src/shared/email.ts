/** Un correo listo para enviar. */
export interface Email {
  to: string;
  subject: string;
  /** Versión en texto plano, para clientes de correo sin HTML (y filtros de spam). */
  text: string;
  html: string;
}

/** PUERTO: enviar correos. En AWS (y en LocalStack) lo implementa SES. */
export interface EmailSender {
  send(email: Email): Promise<void>;
}

/** "ana.maria@correo.com" → "a***@correo.com": así el log no guarda correos completos. */
export function maskEmail(address: string): string {
  const [user = '', domain = ''] = address.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}
