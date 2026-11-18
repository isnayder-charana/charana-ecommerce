import { orderEvent, sqsBody } from '../../test/support/fixtures.js';
import { InvalidMessageError, parseOrderEvent } from './order-event.js';

describe('parseOrderEvent', () => {
  it('saca el evento del sobre de EventBridge', () => {
    expect(parseOrderEvent(sqsBody())).toEqual(orderEvent);
  });

  it('rechaza lo que no es JSON', () => {
    expect(() => parseOrderEvent('hola')).toThrow(new InvalidMessageError('El mensaje no es JSON'));
  });

  it('rechaza eventos incompletos, de otro origen o de un tipo desconocido', () => {
    expect(() => parseOrderEvent(sqsBody({ ...orderEvent, orderId: undefined }))).toThrow(
      /detail\.orderId/,
    );
    expect(() => parseOrderEvent(sqsBody({ ...orderEvent, type: 'OrderLost' }))).toThrow(
      InvalidMessageError,
    );
    expect(() =>
      parseOrderEvent(JSON.stringify({ source: 'otro', 'detail-type': 'x', detail: orderEvent })),
    ).toThrow(/source/);
    expect(() => parseOrderEvent('[]')).toThrow(/raíz/);
  });
});
