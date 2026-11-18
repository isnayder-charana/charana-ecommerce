import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../generated/prisma/client.js';

/**
 * Crea el cliente de Prisma para MySQL. Prisma 7 no trae un motor en Rust:
 * habla con la base a través de un "driver adapter" (aquí, el conector
 * `mariadb`, que también funciona con MySQL).
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  // MySQL 8 usa caching_sha2_password; sin TLS (en local) el conector debe
  // poder pedir la llave pública del servidor para enviar la contraseña.
  if (!url.searchParams.has('allowPublicKeyRetrieval')) {
    url.searchParams.set('allowPublicKeyRetrieval', 'true');
  }
  return new PrismaClient({ adapter: new PrismaMariaDb(url.toString()) });
}

export type { PrismaClient };
export const PRISMA_CLIENT = Symbol('PrismaClient');
