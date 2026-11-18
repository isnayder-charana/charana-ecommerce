/** PUERTO: lo que el almacén necesita de la API de pedidos. */
export interface OrdersApi {
  fulfill(orderId: string, step: 'ship' | 'deliver'): Promise<{ status: string; changed: boolean }>;
}
