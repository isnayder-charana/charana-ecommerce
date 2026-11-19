import { buildHandler } from './handlers.js';

const env = { INTERNAL_API_KEY: 'k'.repeat(32), EMAIL_DELIVERY: 'log' };

describe('buildHandler (qué worker es cada Lambda)', () => {
  it.each(['notifications', 'fulfillment', 'outbox-relay'])('arma %s', (name) => {
    expect(typeof buildHandler(name, env)).toBe('function');
  });

  it('un WORKER desconocido o ausente falla al arrancar, con la lista de válidos', () => {
    expect(() => buildHandler('otro', env)).toThrow(
      'WORKER debe ser uno de: notifications, fulfillment, outbox-relay (llegó "otro")',
    );
    expect(() => buildHandler(undefined, env)).toThrow('(llegó "")');
  });

  it('fulfillment exige INTERNAL_API_KEY; notifications no', () => {
    expect(() => buildHandler('fulfillment', {})).toThrow('Falta INTERNAL_API_KEY');
    expect(typeof buildHandler('notifications', {})).toBe('function');
  });
});
