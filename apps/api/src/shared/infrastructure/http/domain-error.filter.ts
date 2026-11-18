import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type DomainErrorKind } from '../../domain/index.js';

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  validation: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  // Un servicio que necesitamos no está disponible o no está configurado.
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/**
 * Adaptador de salida HTTP para errores de dominio: traduce
 * `DomainError` a una respuesta JSON con el código HTTP adecuado.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];
    response.status(status).json({ statusCode: status, code: error.code, message: error.message });
  }
}
