import { z } from 'zod';
import { CATEGORIES, CURRENCIES } from '../../domain/index.js';

export const listProductsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const createProductBodySchema = z.object({
  sku: z.string(),
  name: z.string().max(120),
  description: z.string().max(2000).default(''),
  category: z.enum(CATEGORIES),
  priceCents: z.number().int(),
  currency: z.enum(CURRENCIES).default('USD'),
  stock: z.number().int(),
  imageUrl: z.url().nullable().optional(),
});

export const productIdParamSchema = z.uuid();
