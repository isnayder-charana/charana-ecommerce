/**
 * Un caso de uso = una acción que el usuario puede hacer
 * ("crear pedido", "listar productos"). Orquesta el dominio
 * y los puertos, pero no contiene reglas de negocio.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
