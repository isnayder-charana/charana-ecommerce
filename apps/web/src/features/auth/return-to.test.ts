import { afterEach, describe, expect, it } from 'vitest';
import { rememberReturnTo, safeReturnTo, signInHref, takeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('acepta rutas internas', () => {
    expect(safeReturnTo('/carrito')).toBe('/carrito');
    expect(safeReturnTo('/productos?q=teclado')).toBe('/productos?q=teclado');
  });

  it.each([
    ['https://sitio-falso.com', 'otro dominio'],
    ['//sitio-falso.com', 'dominio sin protocolo'],
    ['/\\sitio-falso.com', 'barra invertida (algunos navegadores la tratan como //)'],
    ['javascript:alert(1)', 'código'],
    ['', 'vacío'],
    [null, 'sin valor'],
  ])('rechaza %s (%s) y vuelve al inicio', (value, _reason) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});

describe('signInHref', () => {
  it('agrega ?volver solo si no es el inicio', () => {
    expect(signInHref('/')).toBe('/entrar');
    expect(signInHref('/productos?q=usb c')).toBe('/entrar?volver=%2Fproductos%3Fq%3Dusb%20c');
  });
});

describe('rememberReturnTo / takeReturnTo', () => {
  afterEach(() => sessionStorage.clear());

  it('guarda la ruta para después de Google y la borra al leerla', () => {
    rememberReturnTo('/carrito');
    expect(takeReturnTo()).toBe('/carrito');
    expect(takeReturnTo()).toBe('/');
  });

  it('no guarda rutas externas', () => {
    rememberReturnTo('https://sitio-falso.com');
    expect(takeReturnTo()).toBe('/');
  });
});
