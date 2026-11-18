import { AggregateRoot } from './aggregate-root.js';

class Order extends AggregateRoot<string> {
  constructor(id: string) {
    super(id);
  }

  place(): void {
    this.addEvent({ name: 'OrderPlaced', occurredAt: new Date() });
  }
}

class Product extends AggregateRoot<string> {
  constructor(id: string) {
    super(id);
  }
}

describe('AggregateRoot', () => {
  it('acumula eventos y los vacía al leerlos', () => {
    const order = new Order('o-1');
    order.place();

    expect(order.pullEvents().map((e) => e.name)).toEqual(['OrderPlaced']);
    expect(order.pullEvents()).toEqual([]);
  });

  it('compara entidades por id y por tipo', () => {
    expect(new Order('o-1').equals(new Order('o-1'))).toBe(true);
    expect(new Order('o-1').equals(new Order('o-2'))).toBe(false);
    expect(new Order('x').equals(new Product('x'))).toBe(false);
    expect(new Order('o-1').equals(undefined)).toBe(false);
  });
});
