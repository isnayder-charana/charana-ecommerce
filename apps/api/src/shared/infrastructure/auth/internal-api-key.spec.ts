import { UnauthorizedException } from '@nestjs/common';
import { InternalApiKey, InternalApiNotConfiguredError } from './internal-api-key.js';

describe('InternalApiKey', () => {
  const secret = 'a'.repeat(64);

  it('acepta la clave correcta', () => {
    expect(() => new InternalApiKey(secret).verify(secret)).not.toThrow();
  });

  it('rechaza (401) una clave distinta, de otro largo o ausente', () => {
    const key = new InternalApiKey(secret);
    for (const received of ['b'.repeat(64), 'corta', undefined]) {
      expect(() => key.verify(received)).toThrow(UnauthorizedException);
    }
  });

  it('sin clave configurada responde "no configurado" (503), nunca deja pasar', () => {
    expect(() => new InternalApiKey(undefined).verify('lo-que-sea')).toThrow(
      InternalApiNotConfiguredError,
    );
  });
});
