import type { Product } from '../domain/index.js';

/** Lo que la API devuelve al cliente. Separado del dominio a propósito. */
export interface ProductView {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: { cents: number; currency: string };
  stock: number;
  inStock: boolean;
  imageUrl: string | null;
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    sku: product.sku.value,
    name: product.name,
    description: product.description,
    category: product.category,
    price: { cents: product.price.cents, currency: product.price.currency },
    stock: product.stock,
    inStock: product.inStock,
    imageUrl: product.imageUrl,
  };
}
