import type { Logger } from '../shared/logger.js';

/** PUERTO: ¿cuántos mensajes esperan en una cola? En AWS (y LocalStack) lo responde SQS. */
export interface QueueDepth {
  count(queueName: string): Promise<number>;
}

/** Un aviso para el administrador. */
export interface Alert {
  /** Corto y en ASCII: SNS lo usa como asunto del correo (máximo 100 caracteres). */
  subject: string;
  message: string;
}

/** PUERTO: avisar al administrador. En AWS (y LocalStack) lo implementa un tema SNS. */
export interface AlertPublisher {
  publish(alert: Alert): Promise<void>;
}

export interface DlqMonitorDeps {
  depth: QueueDepth;
  alerts: AlertPublisher;
  logger: Logger;
  /** Las colas de fallidos que vigila, por ejemplo `charanatech-notifications-dlq`. */
  queues: string[];
}

/**
 * Vigila las DLQ y avisa por SNS cuando les llega algo. Se comporta como una
 * alarma de CloudWatch, que es lo que la reemplaza en AWS (fase 4):
 *
 * - OK → ALARMA (la cola deja de estar vacía): un aviso "ALARMA".
 * - ALARMA → OK (alguien la vació): un aviso "Resuelto".
 * - Mientras sigue en ALARMA no repite el aviso, aunque lleguen más mensajes:
 *   un mismo problema no debe llenar la bandeja del administrador.
 */
export class DlqMonitor {
  private readonly alarmed = new Set<string>();

  constructor(private readonly deps: DlqMonitorDeps) {}

  /** Una revisión de todas las colas. Si avisar falla, el estado no cambia y se reintenta en la siguiente. */
  async checkOnce(): Promise<void> {
    const { depth, alerts, logger, queues } = this.deps;
    for (const queue of queues) {
      const messages = await depth.count(queue);
      const inAlarm = this.alarmed.has(queue);

      if (messages > 0 && !inAlarm) {
        await alerts.publish({
          subject: `[CharanaTech] ALARMA: ${queue} tiene ${messages} mensaje(s)`,
          message: [
            `La cola ${queue} tiene ${messages} mensaje(s) que fallaron 3 veces.`,
            'Los pedidos afectados no avanzaron o su correo no salió.',
            `Revísalos con: aws --profile localstack sqs receive-message --queue-url <url de ${queue}>`,
          ].join('\n'),
        });
        this.alarmed.add(queue);
        logger.error(`ALARMA: ${queue} tiene ${messages} mensaje(s). Aviso enviado por SNS`);
      } else if (messages === 0 && inAlarm) {
        await alerts.publish({
          subject: `[CharanaTech] Resuelto: ${queue} vacia`,
          message: `La cola ${queue} ya no tiene mensajes.`,
        });
        this.alarmed.delete(queue);
        logger.info(`Resuelto: ${queue} está vacía`);
      }
    }
  }

  /** Revisa cada `intervalMs` hasta que se cancele `signal` (Ctrl+C). */
  async run(signal: AbortSignal, intervalMs: number): Promise<void> {
    let failing = false;
    while (!signal.aborted) {
      try {
        await this.checkOnce();
        failing = false;
      } catch (error) {
        // Por ejemplo, LocalStack apagado: avisamos una vez por racha de fallos.
        if (!failing) {
          this.deps.logger.error(
            `No se pudieron revisar las DLQ (se reintentará): ${(error as Error).message}`,
          );
        }
        failing = true;
      }
      await sleep(intervalMs, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
