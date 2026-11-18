import base from './jest.config.js';

/**
 * Tests de integración: usan el DynamoDB Local de compose.yaml.
 * Antes de correrlos: `pnpm infra:up` en la raíz del repo.
 */
export default {
  ...base,
  roots: ['<rootDir>/test/integration'],
  testRegex: '.*\\.integration-spec\\.ts$',
  collectCoverageFrom: undefined,
  coverageThreshold: undefined,
  testTimeout: 30_000,
};
