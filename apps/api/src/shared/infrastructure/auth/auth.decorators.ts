import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse, ApiSecurity } from '@nestjs/swagger';

export const IS_PUBLIC = 'auth:isPublic';
export const ADMIN_ONLY = 'auth:adminOnly';

/**
 * La ruta no exige token (catálogo, health). En Swagger se marca sin
 * candado: `security: [{}]` reemplaza al token que exigen las demás rutas.
 */
export const Public = () => applyDecorators(SetMetadata(IS_PUBLIC, true), ApiSecurity({}));

/** La ruta exige un usuario del grupo de administradores de Cognito. */
export const AdminOnly = () =>
  applyDecorators(
    SetMetadata(ADMIN_ONLY, true),
    ApiForbiddenResponse({ description: 'El usuario no pertenece al grupo admin' }),
  );
