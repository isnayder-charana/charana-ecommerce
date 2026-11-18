import { z } from 'zod';

/**
 * Variables de entorno validadas al arrancar. Si falta algo o tiene
 * un formato inválido, la app no arranca (mejor fallar pronto).
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    // Autenticación: "cognito" verifica tokens reales; "dev" acepta tokens de prueba.
    AUTH_MODE: z.enum(['cognito', 'dev']).optional(),
    COGNITO_USER_POOL_ID: z
      .string()
      .regex(/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/, 'formato esperado: us-east-1_AbCdEf123')
      .optional(),
    COGNITO_CLIENT_ID: z.string().min(1).optional(),
    COGNITO_ADMIN_GROUP: z.string().min(1).default('admin'),

    // Persistencia: "memory" (rápido, se pierde al reiniciar) o "database" (MySQL + DynamoDB).
    PERSISTENCE: z.enum(['memory', 'database']).optional(),
    DATABASE_URL: z
      .string()
      .regex(/^mysql:\/\//, 'formato esperado: mysql://usuario:clave@host:3306/base')
      .optional(),

    // Región de AWS (la misma en LocalStack). En Lambda, AWS la define automáticamente.
    AWS_REGION: z.string().min(1).default('us-east-2'),
    // Solo en local: http://localhost:8000 (DynamoDB Local). En AWS se deja vacía.
    DYNAMODB_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    DYNAMODB_TABLE: z.string().min(3).default('charanatech'),

    // Eventos (fase 3): el bus de EventBridge donde se publican los eventos de los pedidos.
    EVENT_BUS_NAME: z.string().min(1).default('charanatech'),
    // Solo en local: http://localhost:4566 (LocalStack). En AWS se deja vacía.
    EVENTBRIDGE_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    // Cada cuántos ms el relé revisa la bandeja de salida (outbox). 0 = apagado.
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).optional(),

    // Pagos con Stripe. SOLO claves de prueba: esta tienda es una demo y nunca cobra dinero real.
    // Sin clave, la API arranca igual y "Pagar" responde 503.
    STRIPE_SECRET_KEY: z
      .string()
      .regex(
        /^(sk|rk)_test_[A-Za-z0-9]+$/,
        'solo se aceptan claves de prueba (sk_test_…): esta tienda nunca cobra dinero real',
      )
      .optional(),
    // Secreto para verificar la firma de los webhooks de Stripe.
    // En local lo imprime `stripe listen`; en AWS sale del panel de Stripe (fase 4).
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .regex(/^whsec_[A-Za-z0-9]+$/, 'formato esperado: whsec_…')
      .optional(),
    // Clave compartida con los workers para las rutas /api/internal (paso 25).
    // Genérala con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    INTERNAL_API_KEY: z.string().min(32, 'mínimo 32 caracteres').optional(),
    // Dirección pública de la tienda: Stripe devuelve al cliente ahí después de pagar.
    STORE_URL: z
      .url({ protocol: /^https?$/ })
      .default('http://localhost:3001')
      .transform((url) => url.replace(/\/+$/, '')),

    // Orígenes (tiendas) que pueden llamar a la API desde el navegador, separados por coma.
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3001')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1)),
  })
  .transform((env) => ({
    ...env,
    // Por defecto: "dev" en local, "cognito" en producción.
    AUTH_MODE: env.AUTH_MODE ?? (env.NODE_ENV === 'production' ? 'cognito' : 'dev'),
    PERSISTENCE: env.PERSISTENCE ?? (env.NODE_ENV === 'production' ? 'database' : 'memory'),
    // En los tests el relé va apagado: cada test lo ejecuta a mano cuando lo necesita.
    OUTBOX_RELAY_INTERVAL_MS: env.OUTBOX_RELAY_INTERVAL_MS ?? (env.NODE_ENV === 'test' ? 0 : 1000),
  }))
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AUTH_MODE === 'dev') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'AUTH_MODE=dev está prohibido en producción',
      });
    }
    if (env.NODE_ENV === 'production' && env.PERSISTENCE === 'memory') {
      ctx.addIssue({
        code: 'custom',
        path: ['PERSISTENCE'],
        message: 'PERSISTENCE=memory está prohibido en producción',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of [
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'INTERNAL_API_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'obligatorio en producción' });
        }
      }
    }
    if (env.PERSISTENCE === 'database' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'obligatorio con PERSISTENCE=database',
      });
    }
    if (env.AUTH_MODE === 'cognito') {
      for (const key of ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'obligatorio con AUTH_MODE=cognito',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
