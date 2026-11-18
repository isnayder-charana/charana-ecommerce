/**
 * Entidad: tiene identidad propia que no cambia en el tiempo.
 * Un producto sigue siendo el mismo aunque cambie su precio.
 */
export abstract class Entity<TId extends string> {
  protected constructor(public readonly id: TId) {}

  equals(other?: Entity<TId>): boolean {
    if (!other || other.constructor !== this.constructor) return false;
    return other.id === this.id;
  }
}
