import base from './jest.config.js';

/**
 * Tests de integración: usan el MySQL (base charanatech_test) y el DynamoDB Local
 * de compose.yaml (tabla charanatech-test).
 * Antes de correrlos: `pnpm infra:up` en la raíz del repo.
 */
export default {
  ...base,
  roots: ['<rootDir>/test/integration'],
  testRegex: '.*\\.integration-spec\\.ts$',
  globalSetup: '<rootDir>/test/integration/global-setup.js',
  collectCoverageFrom: undefined,
  coverageThreshold: undefined,
  testTimeout: 30_000,
};
