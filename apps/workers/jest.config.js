/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  // El código es ESM: Jest debe tratar los .ts como módulos ES (igual que en apps/api).
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      { module: { type: 'es6' }, jsc: { target: 'es2024', parser: { syntax: 'typescript' } } },
    ],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    // Puntos de entrada: solo conectan piezas (se prueban a mano con LocalStack).
    '!src/local.ts',
    '!src/lambda/**',
    // Habla con DynamoDB: lo cubre `pnpm test:integration` (necesita Docker).
    '!src/**/dynamodb-*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
