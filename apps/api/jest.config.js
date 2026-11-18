/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  // El código es ESM: Jest debe tratar los .ts como módulos ES.
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        module: { type: 'es6' },
        jsc: {
          target: 'es2024',
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          keepClassNames: true,
        },
      },
    ],
  },
  // En el código importamos './archivo.js' (así lo exige ESM); en los tests apuntamos al .ts.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/generated/**', // código generado por Prisma
    '!src/scripts/**',
    // Adaptadores que hablan con MySQL y DynamoDB: los cubre `pnpm test:integration` (necesita Docker).
    '!src/shared/infrastructure/database/prisma.ts',
    '!src/shared/infrastructure/database/dynamodb.ts',
    '!src/**/prisma-*.repository.ts',
    '!src/**/dynamodb-*.repository.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
