import { type ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../../shared/infrastructure/auth/auth-user.js';

/**
 * En Orders, "el cliente" es el usuario autenticado: su id es el `sub`
 * del token de Cognito. Este decorador traduce un concepto de seguridad
 * (usuario) al lenguaje del módulo (cliente). Los casos de uso no saben
 * nada de tokens.
 */
export const CustomerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const { user } = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  // Nunca debería pasar (JwtAuthGuard corre antes), pero si una ruta fuera
  // @Public() por error, preferimos un 401 a un pedido sin dueño.
  if (!user) throw new UnauthorizedException();
  return user.id;
});
