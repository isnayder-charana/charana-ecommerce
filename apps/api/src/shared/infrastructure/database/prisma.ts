import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../generated/prisma/client.js';

type MariaDbConfig = ConstructorParameters<typeof PrismaMariaDb>[0];

/**
 * Traduce DATABASE_URL a la configuración del conector `mariadb`.
 *
 * - En local (sin TLS): la URL tal cual, más `allowPublicKeyRetrieval`.
 * - En RDS (paso 30): la URL lleva los parámetros de TLS que entiende el CLI
 *   de Prisma (`prisma migrate deploy`):
 *     ?sslcert=/ruta/al/certificado-de-RDS.pem&sslaccept=strict
 *   El conector `mariadb` no los conoce, así que aquí los convertimos en su
 *   opción `ssl`. Una sola URL sirve para migrar y para la API.
 */
export function mariadbConfigFromUrl(
  databaseUrl: string,
  readCa: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): MariaDbConfig {
  const url = new URL(databaseUrl);
  const caPath = url.searchParams.get('sslcert');

  if (!caPath) {
    // MySQL 8 usa caching_sha2_password; sin TLS (en local) el conector debe
    // poder pedir la llave pública del servidor para enviar la contraseña.
    if (!url.searchParams.has('allowPublicKeyRetrieval')) {
      url.searchParams.set('allowPublicKeyRetrieval', 'true');
    }
    return url.toString();
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: {
      // Solo confiamos en la autoridad de RDS: así sabemos que hablamos con NUESTRA base.
      ca: readCa(caPath),
      // "strict" (lo normal): rechaza certificados que no firma esa autoridad
      // o que no son del host al que nos conectamos.
      rejectUnauthorized: url.searchParams.get('sslaccept') !== 'accept_invalid_certs',
    },
  };
}

/**
 * Crea el cliente de Prisma para MySQL. Prisma 7 no trae un motor en Rust:
 * habla con la base a través de un "driver adapter" (aquí, el conector
 * `mariadb`, que también funciona con MySQL).
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfigFromUrl(databaseUrl)) });
}

export type { PrismaClient };
export const PRISMA_CLIENT = Symbol('PrismaClient');
