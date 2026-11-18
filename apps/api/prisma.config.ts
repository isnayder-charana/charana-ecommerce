import { defineConfig } from 'prisma/config';

// El CLI de Prisma no lee .env por sí solo: lo cargamos si existe.
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env usamos los valores por defecto de compose.yaml.
}

/**
 * Configuración del CLI de Prisma (migraciones, generate, seed).
 * La URL viene de DATABASE_URL; el valor por defecto apunta al MySQL de compose.yaml.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm db:seed',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'mysql://charanatech:charanatech@localhost:3306/charanatech',
  },
});
