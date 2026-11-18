import { afterEach, describe, expect, it, vi } from 'vitest';
import { devAuth, signInAsTestUser } from './dev-auth';

describe('devAuth (usuario de prueba)', () => {
  afterEach(() => localStorage.clear());

  it('sin sesión no hay usuario ni token', async () => {
    expect(await devAuth.currentUser()).toBeNull();
    expect(await devAuth.accessToken()).toBeNull();
  });

  it('entra como cliente y genera el token que acepta la API en modo dev', async () => {
    signInAsTestUser('ana');
    expect(await devAuth.currentUser()).toMatchObject({ id: 'ana', isAdmin: false });
    expect(await devAuth.accessToken()).toBe('dev:ana');
    expect(await devAuth.idToken()).toBe('dev:ana');
  });

  it('el admin lleva el grupo en el token', async () => {
    signInAsTestUser('admin', true);
    expect(await devAuth.accessToken()).toBe('dev:admin:admin');
    expect(await devAuth.currentUser()).toMatchObject({ name: 'admin (admin)', isAdmin: true });
  });

  it('ignora un valor manipulado en localStorage', async () => {
    localStorage.setItem('ct_dev_user', JSON.stringify({ username: 'x:admin' }));
    expect(await devAuth.currentUser()).toBeNull();
    localStorage.setItem('ct_dev_user', '{no es json');
    expect(await devAuth.accessToken()).toBeNull();
  });

  it('avisa al entrar y al salir, hasta que se deja de escuchar', async () => {
    const onChange = vi.fn();
    const unsubscribe = devAuth.subscribe(onChange);
    signInAsTestUser('ana');
    await devAuth.signOut();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(await devAuth.currentUser()).toBeNull();

    unsubscribe();
    signInAsTestUser('ana');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
