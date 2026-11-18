import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth-user.js';
import { ADMIN_ONLY } from './auth.decorators.js';

/**
 * Se ejecuta DESPUÉS de JwtAuthGuard. En rutas @AdminOnly() exige que
 * el usuario pertenezca al grupo de administradores. 401 = no sé quién
 * eres; 403 = sé quién eres, pero no tienes permiso.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminGroup: string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!adminOnly) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.groups.includes(this.adminGroup)) {
      throw new ForbiddenException('Solo para administradores');
    }
    return true;
  }
}
