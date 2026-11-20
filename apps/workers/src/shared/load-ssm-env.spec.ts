import { envNameFromParameter, loadSsmEnv, type SsmParametersReader } from './load-ssm-env.js';

const reader = (parameters: Array<{ name: string; value: string }>): SsmParametersReader => ({
  readByPath: async () => parameters,
});

describe('envNameFromParameter', () => {
  it('convierte el último tramo de la ruta en NOMBRE_DE_VARIABLE', () => {
    expect(envNameFromParameter('/charanatech/prod/database-url')).toBe('DATABASE_URL');
    expect(envNameFromParameter('/charanatech/prod/stripe-secret-key')).toBe('STRIPE_SECRET_KEY');
    expect(envNameFromParameter('/charanatech/prod/internal.api_key')).toBe('INTERNAL_API_KEY');
  });
});

describe('loadSsmEnv', () => {
  it('copia los parámetros a las variables de entorno', async () => {
    const env: NodeJS.ProcessEnv = {};
    const loaded = await loadSsmEnv(
      '/charanatech/prod',
      reader([
        { name: '/charanatech/prod/database-url', value: 'mysql://u:p@h:3306/db' },
        { name: '/charanatech/prod/internal-api-key', value: 'k'.repeat(32) },
      ]),
      env,
    );

    expect(env.DATABASE_URL).toBe('mysql://u:p@h:3306/db');
    expect(env.INTERNAL_API_KEY).toBe('k'.repeat(32));
    expect(loaded).toEqual(['DATABASE_URL', 'INTERNAL_API_KEY']);
  });

  it('no pisa una variable que ya está definida', async () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'mysql://local' };
    const loaded = await loadSsmEnv(
      '/charanatech/prod',
      reader([{ name: '/charanatech/prod/database-url', value: 'mysql://ssm' }]),
      env,
    );

    expect(env.DATABASE_URL).toBe('mysql://local');
    expect(loaded).toEqual([]);
  });

  it('pide los parámetros de la ruta indicada', async () => {
    const paths: string[] = [];
    const readByPath = async (path: string) => {
      paths.push(path);
      return [];
    };
    await loadSsmEnv('/charanatech/prod', { readByPath }, {});
    expect(paths).toEqual(['/charanatech/prod']);
  });
});
