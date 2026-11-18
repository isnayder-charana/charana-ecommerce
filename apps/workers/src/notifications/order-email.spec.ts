import { orderEvent } from '../../test/support/fixtures.js';
import { formatMoney, orderEmail } from './order-email.js';

const storeUrl = 'http://localhost:3001';
const withEmail = { ...orderEvent, customerEmail: 'ana@correo.com' };

describe('orderEmail', () => {
  it('arma asunto, texto y HTML con el total y el enlace al pedido', () => {
    const email = orderEmail(
      { ...withEmail, orderId: 'a1b2c3d4-0000-4000-8000-000000000000' },
      storeUrl,
    );

    expect(email?.to).toBe('ana@correo.com');
    expect(email?.subject).toBe('Recibimos tu pago · Pedido A1B2C3D4');
    expect(email?.text).toContain('Total: USD 59.99');
    expect(email?.text).toContain(
      'Ver tu pedido: http://localhost:3001/pedidos/a1b2c3d4-0000-4000-8000-000000000000',
    );
    expect(email?.html).toContain(
      'href="http://localhost:3001/pedidos/a1b2c3d4-0000-4000-8000-000000000000"',
    );
    expect(email?.html).toContain('¡Gracias por tu compra!');
  });

  it.each([
    ['OrderShipped', 'Tu pedido va en camino'],
    ['OrderDelivered', 'Tu pedido fue entregado'],
    ['OrderCancelled', 'Tu pedido fue cancelado'],
  ] as const)('%s → "%s"', (type, subject) => {
    expect(orderEmail({ ...withEmail, type }, storeUrl)?.subject).toBe(`${subject} · Pedido O-1`);
  });

  it('no arma correo para OrderPlaced ni para pedidos sin correo', () => {
    expect(orderEmail({ ...withEmail, type: 'OrderPlaced' }, storeUrl)).toBeNull();
    expect(orderEmail(orderEvent, storeUrl)).toBeNull();
  });

  it('escapa el HTML', () => {
    const email = orderEmail({ ...withEmail, orderId: '<script>' }, storeUrl);
    expect(email?.html).not.toContain('<script>');
    expect(email?.html).toContain('&lt;SCRIPT');
  });

  it('formatea el dinero en soles o dólares', () => {
    expect(formatMoney({ cents: 12345, currency: 'PEN' })).toBe('S/ 123.45');
  });
});
