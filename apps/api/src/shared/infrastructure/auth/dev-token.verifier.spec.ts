import { DevTokenVerifier } from './dev-token.verifier.js';

describe('DevTokenVerifier', () => {
  const verifier = new DevTokenVerifier();

  it('acepta dev:<usuario>', async () => {
    await expect(verifier.verify('dev:isnayder')).resolves.toEqual({
      id: 'dev-isnayder',
      username: 'isnayder',
      groups: [],
    });
  });

  it('acepta dev:<usuario>:<grupos>', async () => {
    const user = await verifier.verify('dev:jefe:admin,ventas');
    expect(user.groups).toEqual(['admin', 'ventas']);
  });

  it.each(['isnayder', 'dev:', 'dev:con espacios'])('rechaza "%s"', async (token) => {
    await expect(verifier.verify(token)).rejects.toThrow('Token de desarrollo inválido');
  });

  it('en desarrollo, el correo sale del mismo token dev y debe ser de la misma persona', async () => {
    await expect(verifier.emailOf('dev:ana', 'dev-ana')).resolves.toBe('ana@ejemplo.dev');
    await expect(verifier.emailOf('dev:ana', 'dev-otro')).rejects.toThrow('mismo usuario');
  });
});
