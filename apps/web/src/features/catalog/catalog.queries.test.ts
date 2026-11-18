import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { isNotFound, productQuery } from './catalog.queries';

describe('isNotFound', () => {
  it('404 y 400 de la API significan "no existe"', () => {
    expect(isNotFound(new ApiError(404, 'PRODUCT_NOT_FOUND', ''))).toBe(true);
    expect(isNotFound(new ApiError(400, 'VALIDATION_FAILED', ''))).toBe(true);
  });

  it('un error del servidor o de red no', () => {
    expect(isNotFound(new ApiError(500, 'HTTP_ERROR', ''))).toBe(false);
    expect(isNotFound(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('productQuery', () => {
  const retry = productQuery('x').retry as (count: number, error: unknown) => boolean;

  it('no reintenta si el producto no existe', () => {
    expect(retry(0, new ApiError(404, 'PRODUCT_NOT_FOUND', ''))).toBe(false);
  });

  it('reintenta una vez los fallos de red', () => {
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(false);
  });
});
