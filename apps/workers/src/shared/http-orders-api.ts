import type { OrdersApi } from '../fulfillment/orders-api.js';

/**
 * ADAPTADOR: llama a la ruta interna de la API con la clave compartida
 * (cabecera X-Internal-Key). Cualquier respuesta que no sea 2xx es un error:
 * el mensaje se reintenta y, si sigue fallando, termina en la DLQ.
 */
export class HttpOrdersApi implements OrdersApi {
  constructor(
    private readonly apiUrl: string,
    private readonly internalKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async fulfill(orderId: string, step: 'ship' | 'deliver') {
    const response = await this.fetchFn(
      `${this.apiUrl}/internal/orders/${encodeURIComponent(orderId)}/fulfillment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': this.internalKey },
        body: JSON.stringify({ step }),
        signal: AbortSignal.timeout(10_000), // que una API colgada no bloquee al worker
      },
    );
    const body = (await response.json().catch(() => null)) as {
      status?: string;
      changed?: boolean;
      code?: string;
    } | null;
    if (!response.ok) {
      throw new Error(`La API respondió ${response.status} (${body?.code ?? 'sin código'})`);
    }
    return { status: String(body?.status), changed: body?.changed === true };
  }
}
