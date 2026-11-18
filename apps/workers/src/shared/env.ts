import { z } from 'zod';

const url = z.url({ protocol: /^https?$/ });

const schema = z.object({
  AWS_REGION: z.string().min(1).default('us-east-2'),
  DYNAMODB_TABLE: z.string().min(1).default('charanatech'),
  /** Solo en local (DynamoDB Local). En AWS se deja vacía. */
  DYNAMODB_ENDPOINT: url.optional(),
  /** Solo en local (LocalStack). En AWS se deja vacía. */
  SQS_ENDPOINT: url.optional(),
  /** Solo en local (LocalStack). En AWS se deja vacía. */
  SES_ENDPOINT: url.optional(),
  /** Remitente de los correos: debe estar verificado en SES. */
  EMAIL_FROM: z.email().default('no-reply@charanatech.local'),
  /** Para el enlace "Ver mi pedido" de los correos. */
  /** La API de pedidos (el worker fulfillment le pide avanzar el pedido). */
  API_URL: url.default('http://localhost:3000/api').transform((u) => u.replace(/\/+$/, '')),
  /** La misma clave que INTERNAL_API_KEY de apps/api/.env. */
  INTERNAL_API_KEY: z.string().min(32, 'mínimo 32 caracteres').optional(),
  STORE_URL: url.default('http://localhost:3001').transform((u) => u.replace(/\/+$/, '')),
  /** Solo en local (LocalStack). En AWS las alertas las da CloudWatch (fase 4). */
  SNS_ENDPOINT: url.optional(),
  /** Tema SNS donde se avisa al administrador (paso 26). */
  ALERTS_TOPIC: z.string().min(1).default('charanatech-alerts'),
  /** Cada cuántos segundos se revisan las DLQ en tu PC. */
  DLQ_CHECK_SECONDS: z.coerce.number().int().min(1).default(30),
});

/** La clave interna es obligatoria para correr los workers (sin ella, el almacén no puede avanzar pedidos). */
export function requireInternalKey(env: WorkersEnv): string {
  if (!env.INTERNAL_API_KEY) {
    throw new Error(
      'Falta INTERNAL_API_KEY en apps/workers/.env (la misma que en apps/api/.env; ver paso 25)',
    );
  }
  return env.INTERNAL_API_KEY;
}
export type WorkersEnv = z.infer<typeof schema>;

/** Valida las variables al arrancar: si falta o sobra algo, falla con un mensaje claro. */
export function loadEnv(source: Record<string, string | undefined>): WorkersEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variables de entorno inválidas:\n${details.join('\n')}`);
  }
  return result.data;
}
