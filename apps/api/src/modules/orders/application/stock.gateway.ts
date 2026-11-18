import type { Currency } from '../../catalog/domain/money.js';

export interface StockRequest {
  productId: string;
  quantity: number;
}

/** Lo que Orders necesita saber de un producto: una "foto" al momento de comprar. */
export interface ReservedItem {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  currency: Currency;
  quantity: number;
}

/**
 * PUERTO hacia otro módulo. Orders no toca el repositorio de Catalog
 * directamente: pide "resérvame este stock" y recibe lo que necesita.
 * Si mañana Catalog fuera otro microservicio, solo cambia el adaptador.
 */
export interface StockGateway {
  /** Todo o nada: si un producto no tiene stock, no se reserva ninguno. */
  reserve(items: StockRequest[]): Promise<ReservedItem[]>;
  release(items: StockRequest[]): Promise<void>;
}

export const STOCK_GATEWAY = Symbol('StockGateway');
