/**
 * Objeto de valor: se define por sus atributos, no por un id.
 * Dos `Money(10, 'USD')` son iguales aunque sean instancias distintas.
 * Es inmutable: para "cambiarlo" se crea uno nuevo.
 */
export abstract class ValueObject<TProps extends Record<string, unknown>> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (!other || other.constructor !== this.constructor) return false;
    const keys = Object.keys(this.props) as (keyof TProps)[];
    return keys.every((key) => this.props[key] === other.props[key]);
  }
}
