import { execSync } from 'node:child_process';

// Permite cambiar TEST_DATABASE_URL desde apps/api/.env (p. ej. si MySQL usa otro puerto).
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env usamos el valor por defecto de compose.yaml.
}

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'mysql://charanatech:charanatech@localhost:3306/charanatech_test';

/** Aplica las migraciones a la base de tests antes de correr la suite. */
export default function globalSetup() {
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
