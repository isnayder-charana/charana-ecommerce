import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { anOrder } from '@/test/fixtures';
import { checkoutFailure } from './checkout';
import {
  canCancel,
  FULFILLMENT_CHECK_MS,
  MAX_PAYMENT_CHECKS,
  refreshInterval,
  countUnits,
  expectedEmails,
  formatDate,
  orderNumber,
  orderSchema,
  parsePaymentReturn,
} from './order';

describe('pedido', () => {
  it('espera un correo por cada cambio que avisa (crear el pedido no avisa)', () => {
    expect(expectedEmails(anOrder())).toBe(0);
    expect(
      expectedEmails(
        anOrder({
          history: [
            { status: 'PENDING_PAYMENT', at: '2026-11-13T23:13:00.000Z' },
            { status: 'PAID', at: '2026-11-13T23:14:00.000Z' },
            { status: 'CANCELLED', at: '2026-11-13T23:15:00.000Z' },
          ],
        }),
      ),
    ).toBe(2);
  });

  it('valida la respuesta de la API', () => {
    expect(orderSchema.parse(anOrder())).toEqual(anOrder());
    expect(orderSchema.safeParse({ ...anOrder(), status: 'LOST' }).success).toBe(false);
  });

  it('se puede cancelar solo antes de enviarse (igual que la API)', () => {
    expect(canCancel({ status: 'PENDING_PAYMENT' })).toBe(true);
    expect(canCancel({ status: 'PAID' })).toBe(true);
    expect(canCancel({ status: 'SHIPPED' })).toBe(false);
    expect(canCancel({ status: 'DELIVERED' })).toBe(false);
    expect(canCancel({ status: 'CANCELLED' })).toBe(false);
  });

  it('número corto, unidades y fecha en hora de Lima', () => {
    expect(orderNumber(anOrder())).toBe('D7E25385');
    expect(countUnits(anOrder())).toBe(2);
    expect(formatDate('2026-11-13T23:13:00.000Z')).toMatch(/13 nov\.? 2026,? 6:13/);
  });
});

describe('checkoutFailure', () => {
  it('sesión vencida → volver a iniciar sesión', () => {
    expect(checkoutFailure(new ApiError(401, 'UNAUTHORIZED', 'x'))).toMatchObject({
      reason: 'signin',
    });
  });

  it.each([
    ['INSUFFICIENT_STOCK', 'stock suficiente'],
    ['PRODUCT_NOT_FOUND', 'ya no está a la venta'],
    ['OTRO', 'No pudimos crear el pedido'],
  ])('%s → mensaje claro', (code, text) => {
    const result = checkoutFailure(new ApiError(409, code, 'x'));
    expect(result.reason).toBe('error');
    expect(result.message).toContain(text);
  });

  it('un error de red también tiene mensaje', () => {
    expect(checkoutFailure(new TypeError('fetch failed')).message).toMatch(/No pudimos/);
  });
});

describe('parsePaymentReturn', () => {
  it('solo acepta los dos valores que usa Stripe al volver', () => {
    expect(parsePaymentReturn('exito')).toBe('exito');
    expect(parsePaymentReturn('cancelado')).toBe('cancelado');
    expect(parsePaymentReturn('otra-cosa')).toBeUndefined();
    expect(parsePaymentReturn(undefined)).toBeUndefined();
  });
});

describe('refreshInterval', () => {
  it('al volver de Stripe pregunta cada 2 s hasta el máximo', () => {
    expect(refreshInterval('PENDING_PAYMENT', 'exito', 0)).toBe(2000);
    expect(refreshInterval('PENDING_PAYMENT', 'exito', MAX_PAYMENT_CHECKS)).toBe(false);
    expect(refreshInterval('PENDING_PAYMENT', 'cancelado', 0)).toBe(false);
    expect(refreshInterval('PENDING_PAYMENT', undefined, 0)).toBe(false);
  });

  it('mientras el almacén lo mueve (pagado o enviado), pregunta cada 5 s', () => {
    expect(refreshInterval('PAID', undefined, 99)).toBe(FULFILLMENT_CHECK_MS);
    expect(refreshInterval('SHIPPED', 'exito', 0)).toBe(FULFILLMENT_CHECK_MS);
  });

  it('entregado, cancelado o sin datos: ya no cambia solo', () => {
    expect(refreshInterval('DELIVERED', undefined, 0)).toBe(false);
    expect(refreshInterval('CANCELLED', 'exito', 0)).toBe(false);
    expect(refreshInterval(undefined, undefined, 0)).toBe(false);
  });
});
