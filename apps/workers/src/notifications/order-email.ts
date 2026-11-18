import type { Email } from '../shared/email.js';
import type { OrderEvent } from '../shared/order-event.js';

interface Template {
  subject: string;
  /** Primera línea del correo. */
  headline: string;
  detail: string;
}

/** Qué decirle al cliente en cada cambio de su pedido. OrderPlaced no avisa: aún no pagó. */
const TEMPLATES: Partial<Record<OrderEvent['type'], Template>> = {
  OrderPaid: {
    subject: 'Recibimos tu pago',
    headline: '¡Gracias por tu compra!',
    detail: 'Confirmamos tu pago. Estamos preparando tu pedido para enviarlo.',
  },
  OrderShipped: {
    subject: 'Tu pedido va en camino',
    headline: 'Tu pedido salió de nuestro almacén',
    detail: 'Ya está en camino. Te avisaremos cuando llegue.',
  },
  OrderDelivered: {
    subject: 'Tu pedido fue entregado',
    headline: '¡Tu pedido llegó!',
    detail: 'Esperamos que disfrutes tu compra.',
  },
  OrderCancelled: {
    subject: 'Tu pedido fue cancelado',
    headline: 'Cancelamos tu pedido',
    detail: 'Si ya habías pagado, el reembolso aparecerá en tu tarjeta en unos días.',
  },
};

export function formatMoney({ cents, currency }: OrderEvent['total']): string {
  // Intl separa el símbolo con un espacio "duro" (U+00A0): lo cambiamos por uno normal.
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency })
    .format(cents / 100)
    .replace(/\u00a0/g, ' ');
}

/** Arma el correo de un evento, o null si ese evento no se avisa o el pedido no tiene correo. */
export function orderEmail(event: OrderEvent, storeUrl: string): Email | null {
  const template = TEMPLATES[event.type];
  if (!template || !event.customerEmail) return null;

  const shortId = event.orderId.slice(0, 8).toUpperCase();
  const link = `${storeUrl}/pedidos/${encodeURIComponent(event.orderId)}`;
  const total = formatMoney(event.total);
  const subject = `${template.subject} · Pedido ${shortId}`;

  const text = [
    template.headline,
    '',
    template.detail,
    '',
    `Pedido: ${shortId}`,
    `Total: ${total}`,
    `Ver tu pedido: ${link}`,
    '',
    'CharanaTech · Tienda de demostración: no se cobra dinero real.',
  ].join('\n');

  // Estilos en línea: muchos clientes de correo ignoran <style>. Los valores vienen
  // del evento validado (ids, montos), pero igual se escapan.
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:8px;padding:24px">
    <p style="margin:0 0 16px;font-weight:bold;color:#1d4ed8">CharanaTech</p>
    <h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(template.headline)}</h1>
    <p style="margin:0 0 16px">${escapeHtml(template.detail)}</p>
    <p style="margin:0">Pedido: <strong>${escapeHtml(shortId)}</strong></p>
    <p style="margin:0 0 24px">Total: <strong>${escapeHtml(total)}</strong></p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Ver mi pedido</a>
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280">Tienda de demostración: no se cobra dinero real.</p>
  </div>
</body></html>`;

  return { to: event.customerEmail, subject, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
