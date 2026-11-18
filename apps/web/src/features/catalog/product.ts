import { z } from 'zod';

/**
 * Producto tal como lo devuelve la API (ProductView en apps/api).
 * El tipo TypeScript se DEDUCE del esquema: una sola fuente de verdad.
 */
export const productSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.object({ cents: z.number().int(), currency: z.string() }),
  stock: z.number().int(),
  inStock: z.boolean(),
  imageUrl: z.string().nullable(),
});

export type Product = z.infer<typeof productSchema>;

/** Respuesta paginada de GET /api/products. */
export const productListSchema = z.object({
  items: z.array(productSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type ProductList = z.infer<typeof productListSchema>;

/** Nombre visible de cada categoría (la API guarda el slug sin tildes). */
export const CATEGORY_LABELS: Record<string, string> = {
  audio: 'Audio',
  cargadores: 'Cargadores',
  cables: 'Cables',
  perifericos: 'Periféricos',
  fundas: 'Fundas',
  almacenamiento: 'Almacenamiento',
};

export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug;
}
