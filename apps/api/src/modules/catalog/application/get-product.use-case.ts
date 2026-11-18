import type { UseCase } from '../../../shared/application/use-case.js';
import { ProductNotFoundError } from '../domain/index.js';
import type { ProductRepository } from './product.repository.js';
import { type ProductView, toProductView } from './product.view.js';

export class GetProductUseCase implements UseCase<{ id: string }, ProductView> {
  constructor(private readonly products: ProductRepository) {}

  async execute({ id }: { id: string }): Promise<ProductView> {
    const product = await this.products.findById(id);
    if (!product) throw new ProductNotFoundError(id);
    return toProductView(product);
  }
}
