import { validateEnv } from './env.js';

const cognito = {
  AUTH_MODE: 'cognito',
  COGNITO_USER_POOL_ID: 'us-east-1_AbC123',
  COGNITO_CLIENT_ID: 'abc',
};

const mysql = { DATABASE_URL: 'mysql://u:p@localhost:3306/db' };
const stripe = {
  STRIPE_SECRET_KEY: 'sk_test_abc123',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
  INTERNAL_API_KEY: 'k'.repeat(64),
};

describe('validateEnv', () => {
  it('aplica valores por defecto (modo dev en local)', () => {
    expect(validateEnv({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      AUTH_MODE: 'dev',
      COGNITO_ADMIN_GROUP: 'admin',
      PERSISTENCE: 'memory',
    });
  });

  it('convierte PORT a número', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('falla con un PORT inválido', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow('Variables de entorno inválidas');
  });

  it('en producción usa Cognito por defecto y exige sus variables', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow('COGNITO_USER_POOL_ID');
    expect(validateEnv({ NODE_ENV: 'production', ...cognito, ...mysql, ...stripe }).AUTH_MODE).toBe(
      'cognito',
    );
  });

  it('prohíbe el modo dev en producción', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', AUTH_MODE: 'dev', ...mysql })).toThrow(
      'prohibido en producción',
    );
  });

  it('valida el formato del user pool id', () => {
    expect(() => validateEnv({ ...cognito, COGNITO_USER_POOL_ID: 'pool' })).toThrow(
      'us-east-1_AbCdEf123',
    );
  });

  it('en producción usa la base de datos y exige DATABASE_URL', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', ...cognito })).toThrow('DATABASE_URL');
    expect(
      validateEnv({ NODE_ENV: 'production', ...cognito, ...mysql, ...stripe }).PERSISTENCE,
    ).toBe('database');
  });

  it('prohíbe la persistencia en memoria en producción', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', ...cognito, ...mysql, PERSISTENCE: 'memory' }),
    ).toThrow('PERSISTENCE=memory está prohibido');
  });

  it('valida el formato de DATABASE_URL', () => {
    expect(() => validateEnv({ PERSISTENCE: 'database', DATABASE_URL: 'postgres://x' })).toThrow(
      'mysql://',
    );
  });

  it('configura DynamoDB con valores por defecto y valida el endpoint', () => {
    expect(validateEnv({})).toMatchObject({
      AWS_REGION: 'us-east-2',
      DYNAMODB_TABLE: 'charanatech',
    });
    expect(validateEnv({ DYNAMODB_ENDPOINT: 'http://localhost:8000' }).DYNAMODB_ENDPOINT).toBe(
      'http://localhost:8000',
    );
    expect(() => validateEnv({ DYNAMODB_ENDPOINT: 'localhost:8000' })).toThrow('DYNAMODB_ENDPOINT');
  });

  it('lee los orígenes de CORS como lista (por defecto, la tienda en local)', () => {
    expect(validateEnv({}).CORS_ORIGINS).toEqual(['http://localhost:3001']);
    expect(
      validateEnv({ CORS_ORIGINS: 'http://localhost:3001, https://charanatech.vercel.app' })
        .CORS_ORIGINS,
    ).toEqual(['http://localhost:3001', 'https://charanatech.vercel.app']);
    expect(() => validateEnv({ CORS_ORIGINS: 'charanatech.vercel.app' })).toThrow('CORS_ORIGINS');
  });

  it('solo acepta claves de Stripe de prueba', () => {
    expect(validateEnv({ STRIPE_SECRET_KEY: 'sk_test_abc123' }).STRIPE_SECRET_KEY).toBe(
      'sk_test_abc123',
    );
    expect(() => validateEnv({ STRIPE_SECRET_KEY: 'sk_live_abc123' })).toThrow(
      'nunca cobra dinero real',
    );
  });

  it('exige Stripe en producción y limpia la barra final de STORE_URL', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', ...cognito, ...mysql })).toThrow(
      'STRIPE_SECRET_KEY',
    );
    expect(() =>
      validateEnv({ NODE_ENV: 'production', ...cognito, ...mysql, STRIPE_SECRET_KEY: 'sk_test_a' }),
    ).toThrow('STRIPE_WEBHOOK_SECRET');
    expect(() => validateEnv({ STRIPE_WEBHOOK_SECRET: 'abc' })).toThrow('whsec_');
    expect(validateEnv({ STORE_URL: 'https://charanatech.dev/' }).STORE_URL).toBe(
      'https://charanatech.dev',
    );
  });

  it('la clave interna es opcional en local, larga y obligatoria en producción', () => {
    expect(validateEnv({}).INTERNAL_API_KEY).toBeUndefined();
    expect(() => validateEnv({ INTERNAL_API_KEY: 'corta' })).toThrow('mínimo 32');
    const { INTERNAL_API_KEY: _, ...withoutKey } = stripe;
    expect(() =>
      validateEnv({ NODE_ENV: 'production', ...cognito, ...mysql, ...withoutKey }),
    ).toThrow('INTERNAL_API_KEY');
  });
});
