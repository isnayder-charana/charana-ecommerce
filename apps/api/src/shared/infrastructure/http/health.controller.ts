import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators.js';

@ApiTags('Sistema')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Comprueba que la API responde' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
