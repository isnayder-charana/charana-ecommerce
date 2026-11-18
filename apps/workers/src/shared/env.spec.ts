import { consoleLogger } from './logger.js';
import { loadEnv, requireInternalKey } from './env.js';

describe('loadEnv', () => {
  it('usa valores por defecto y trata las variables vacías como ausentes', () => {
    expect(loadEnv({ SQS_ENDPOINT: '' })).toEqual({
      AWS_REGION: 'us-east-2',
      DYNAMODB_TABLE: 'charanatech',
      EMAIL_FROM: 'no-reply@charanatech.local',
      API_URL: 'http://localhost:3000/api',
      STORE_URL: 'http://localhost:3001',
      ALERTS_TOPIC: 'charanatech-alerts',
      DLQ_CHECK_SECONDS: 30,
    });
    expect(loadEnv({ STORE_URL: 'https://tienda.com/' }).STORE_URL).toBe('https://tienda.com');
  });

  it('valida que los endpoints sean URLs', () => {
    expect(loadEnv({ SQS_ENDPOINT: 'http://localhost:4566' }).SQS_ENDPOINT).toBe(
      'http://localhost:4566',
    );
    expect(() => loadEnv({ DYNAMODB_ENDPOINT: 'localhost:8000' })).toThrow('DYNAMODB_ENDPOINT');
  });

  it('lee cada cuántos segundos revisar las DLQ (entero, mínimo 1)', () => {
    expect(loadEnv({ DLQ_CHECK_SECONDS: '5' }).DLQ_CHECK_SECONDS).toBe(5);
    expect(() => loadEnv({ DLQ_CHECK_SECONDS: '0' })).toThrow('DLQ_CHECK_SECONDS');
  });
});

describe('requireInternalKey', () => {
  it('exige la clave interna con un mensaje que dice dónde ponerla', () => {
    expect(() => requireInternalKey(loadEnv({}))).toThrow('apps/workers/.env');
    expect(() => loadEnv({ INTERNAL_API_KEY: 'corta' })).toThrow('mínimo 32');
    expect(requireInternalKey(loadEnv({ INTERNAL_API_KEY: 'k'.repeat(32) }))).toBe('k'.repeat(32));
  });
});

describe('consoleLogger', () => {
  it('antepone el nombre del worker', () => {
    const out: string[] = [];
    const { log, error } = console;
    console.log = (m: string) => out.push(m);
    console.error = (m: string) => out.push(`E ${m}`);
    try {
      const logger = consoleLogger('fulfillment');
      logger.info('hola');
      logger.error('ups');
    } finally {
      Object.assign(console, { log, error });
    }
    expect(out).toEqual(['[fulfillment] hola', 'E [fulfillment] ups']);
  });
});
