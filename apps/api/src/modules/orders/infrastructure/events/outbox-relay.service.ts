import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { PublishOutboxUseCase } from '../../application/publish-outbox.use-case.js';

/**
 * Corre el relé del outbox cada `intervalMs` mientras la API está encendida.
 *
 * En local es lo más simple. En AWS (fase 4) no hará falta: DynamoDB Streams
 * avisará a una Lambda cada vez que se escriba un evento en la bandeja.
 */
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Outbox');
  private timer?: NodeJS.Timeout;
  private running = false;
  private failing = false;

  constructor(
    private readonly publishOutbox: PublishOutboxUseCase,
    /** 0 = apagado (por ejemplo, en los tests). */
    private readonly intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervalMs > 0) this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Una vuelta del relé. Público para poder probarlo sin esperar al temporizador. */
  async tick(): Promise<void> {
    if (this.running) return; // si la vuelta anterior no terminó, no se pisan
    this.running = true;
    try {
      const published = await this.publishOutbox.execute();
      if (published > 0) this.logger.log(`${published} evento(s) publicados en el bus`);
      if (this.failing) this.logger.log('El bus de eventos volvió a responder');
      this.failing = false;
    } catch (error) {
      // Los eventos siguen en la bandeja y se reintentan en la próxima vuelta.
      // Avisamos una sola vez por racha de fallos para no llenar el log.
      if (!this.failing) {
        this.logger.warn(`No se pudo publicar (se reintentará): ${(error as Error).message}`);
      }
      this.failing = true;
    } finally {
      this.running = false;
    }
  }
}
