import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth-user.js';
import { IS_PUBLIC } from './auth.decorators.js';
import { TOKEN_VERIFIER, type TokenVerifier } from './token-verifier.js';

/**
 * Guard GLOBAL: toda ruta exige `Authorization: Bearer <token>`
 * salvo las marcadas con @Public(). "Seguro por defecto": si olvidas
 * un decorador, la ruta queda protegida, no expuesta.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token (Authorization: Bearer ...)');
    }

    try {
      request.user = await this.verifier.verify(token);
      return true;
    } catch {
      // No devolvemos el motivo exacto: no ayudamos a quien intenta falsificar tokens.
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
