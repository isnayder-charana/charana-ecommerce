import type { ProductPrimitives } from '../../domain/index.js';

/**
 * La foto de cada producto se llama como su SKU en minúsculas (paso 33):
 *
 *   CT-AUD-001  →  <PRODUCT_IMAGES_URL>/ct-aud-001.jpg
 *
 * En tu PC, PRODUCT_IMAGES_URL apunta a apps/web/public/products (la sirve
 * Next.js); en AWS, a CloudFront. Sin la variable, los productos no tienen foto
 * y la tienda muestra el dibujo de su categoría.
 */
export function productImageUrl(sku: string, baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}/${sku.toLowerCase()}.jpg`;
}

/** Productos de ejemplo para desarrollo. */
export const PRODUCT_SEED: ProductPrimitives[] = [
  {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1001',
    sku: 'CT-AUD-001',
    name: 'Audífonos inalámbricos Pulse',
    description: 'Bluetooth 5.4, cancelación de ruido y 30 horas de batería.',
    category: 'audio',
    priceCents: 5999,
    currency: 'USD',
    stock: 25,
    imageUrl: null,
    version: 1,
  },
  {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1002',
    sku: 'CT-CHG-001',
    name: 'Cargador GaN 65W',
    description: 'Dos puertos USB-C y uno USB-A, carga rápida para laptop y celular.',
    category: 'cargadores',
    priceCents: 3499,
    currency: 'USD',
    stock: 40,
    imageUrl: null,
    version: 1,
  },
  {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1003',
    sku: 'CT-CAB-001',
    name: 'Cable USB-C trenzado 2 m',
    description: 'Soporta 100W y transferencia de datos a 10 Gbps.',
    category: 'cables',
    priceCents: 1299,
    currency: 'USD',
    stock: 120,
    imageUrl: null,
    version: 1,
  },
  {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1004',
    sku: 'CT-PER-001',
    name: 'Teclado mecánico compacto',
    description: 'Formato 75%, switches intercambiables y retroiluminación RGB.',
    category: 'perifericos',
    priceCents: 8999,
    currency: 'USD',
    stock: 12,
    imageUrl: null,
    version: 1,
  },
  {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1005',
    sku: 'CT-PER-002',
    name: 'Mouse ergonómico vertical',
    description: 'Reduce la tensión de la muñeca. Conexión Bluetooth y 2.4 GHz.',
    category: 'perifericos',
    priceCents: 3999,
    currency: 'USD',
    stock: 0,
    imageUrl: null,
    version: 1,
  },
  {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1006',
    sku: 'CT-STO-001',
    name: 'SSD portátil 1 TB',
    description: 'USB-C 3.2, hasta 1050 MB/s, resistente a golpes.',
    category: 'almacenamiento',
    priceCents: 10999,
    currency: 'USD',
    stock: 18,
    imageUrl: null,
    version: 1,
  },
];
