import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';

type Issue = { message: string; path?: readonly (PropertyKey | { key: PropertyKey })[] };

/**
 * Pipe GLOBAL de validación. Cada parámetro declara su esquema en el propio
 * decorador, por ejemplo `@Body({ schema: placeOrderBodySchema })`. NestJS 12
 * guarda ese esquema en la metadata del parámetro y:
 *  - este pipe lo usa para validar y transformar la entrada;
 *  - Swagger lo usa para documentar la ruta (una sola fuente de verdad).
 *
 * Funciona con cualquier librería que cumpla "Standard Schema" (Zod, Valibot,
 * ArkType...). Si no cumple, responde 400 con el detalle de cada campo.
 */
export class SchemaValidationPipe implements PipeTransform {
  async transform(value: unknown, { schema }: ArgumentMetadata): Promise<unknown> {
    if (!schema) return value;

    const result = await schema['~standard'].validate(value);
    if (result.issues) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Datos de entrada inválidos',
        errors: result.issues.map((issue: Issue) => ({
          path: (issue.path ?? []).map((p) => String(typeof p === 'object' ? p.key : p)).join('.'),
          message: issue.message,
        })),
      });
    }
    return result.value;
  }
}
