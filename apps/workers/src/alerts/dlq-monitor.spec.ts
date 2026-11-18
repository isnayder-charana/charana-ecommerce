import { memoryLogger } from '../../test/support/fixtures.js';
import { type Alert, type AlertPublisher, DlqMonitor, type QueueDepth } from './dlq-monitor.js';

/** Colas de prueba: cuántos mensajes tiene cada una (se puede cambiar o hacer fallar). */
class FakeDepth implements QueueDepth {
  readonly counts = new Map<string, number>();
  failWith?: Error;
  async count(queue: string) {
    if (this.failWith) throw this.failWith;
    return this.counts.get(queue) ?? 0;
  }
}

class FakeAlerts implements AlertPublisher {
  readonly sent: Alert[] = [];
  failWith?: Error;
  async publish(alert: Alert) {
    if (this.failWith) throw this.failWith;
    this.sent.push(alert);
  }
}

const DLQ = 'charanatech-notifications-dlq';

function setup() {
  const depth = new FakeDepth();
  const alerts = new FakeAlerts();
  const logger = memoryLogger();
  const monitor = new DlqMonitor({ depth, alerts, logger, queues: [DLQ, 'otra-dlq'] });
  return { depth, alerts, logger, monitor };
}

describe('DlqMonitor (alertas de las DLQ)', () => {
  it('con las DLQ vacías no avisa nada', async () => {
    const { alerts, monitor } = setup();
    await monitor.checkOnce();
    expect(alerts.sent).toEqual([]);
  });

  it('avisa UNA vez cuando llega algo y no repite mientras siga en alarma', async () => {
    const { depth, alerts, logger, monitor } = setup();
    depth.counts.set(DLQ, 2);
    await monitor.checkOnce();
    depth.counts.set(DLQ, 5); // llegan más: es el mismo problema
    await monitor.checkOnce();

    expect(alerts.sent).toHaveLength(1);
    expect(alerts.sent[0]?.subject).toBe(`[CharanaTech] ALARMA: ${DLQ} tiene 2 mensaje(s)`);
    expect(alerts.sent[0]?.message).toContain('fallaron 3 veces');
    expect(logger.lines).toEqual([
      `ERROR ALARMA: ${DLQ} tiene 2 mensaje(s). Aviso enviado por SNS`,
    ]);
  });

  it('avisa "Resuelto" cuando la vacían, y vuelve a avisar si se llena otra vez', async () => {
    const { depth, alerts, monitor } = setup();
    depth.counts.set(DLQ, 1);
    await monitor.checkOnce();
    depth.counts.set(DLQ, 0);
    await monitor.checkOnce();
    depth.counts.set(DLQ, 1);
    await monitor.checkOnce();

    expect(alerts.sent.map((a) => a.subject)).toEqual([
      `[CharanaTech] ALARMA: ${DLQ} tiene 1 mensaje(s)`,
      `[CharanaTech] Resuelto: ${DLQ} vacia`,
      `[CharanaTech] ALARMA: ${DLQ} tiene 1 mensaje(s)`,
    ]);
  });

  it('los asuntos son ASCII y de menos de 100 caracteres (lo exige SNS)', async () => {
    const { depth, alerts, monitor } = setup();
    depth.counts.set(DLQ, 12345);
    await monitor.checkOnce();
    depth.counts.set(DLQ, 0);
    await monitor.checkOnce();
    for (const { subject } of alerts.sent) {
      expect(subject).toMatch(/^[\x20-\x7e]+$/);
      expect(subject.length).toBeLessThan(100);
    }
  });

  it('si SNS falla, no da la alarma por avisada: lo reintenta en la siguiente revisión', async () => {
    const { depth, alerts, monitor } = setup();
    depth.counts.set(DLQ, 1);
    alerts.failWith = new Error('SNS caído');
    await expect(monitor.checkOnce()).rejects.toThrow('SNS caído');

    alerts.failWith = undefined;
    await monitor.checkOnce();
    expect(alerts.sent).toHaveLength(1);
  });

  it('run(): revisa cada cierto tiempo, avisa una vez por racha de fallos y se detiene', async () => {
    const { depth, alerts, logger, monitor } = setup();
    depth.failWith = new Error('LocalStack apagado');
    const stop = new AbortController();
    const running = monitor.run(stop.signal, 5);

    await new Promise((r) => setTimeout(r, 30)); // varias vueltas fallidas
    depth.failWith = undefined;
    depth.counts.set(DLQ, 1);
    await new Promise((r) => setTimeout(r, 30));
    stop.abort();
    await running;

    expect(logger.lines.filter((l) => l.includes('No se pudieron revisar'))).toEqual([
      'ERROR No se pudieron revisar las DLQ (se reintentará): LocalStack apagado',
    ]);
    expect(alerts.sent).toHaveLength(1);
  });
});
