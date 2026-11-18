import type { UseCase } from '../../../shared/application/use-case.js';
import { type NewProduct, Product, SkuAlreadyExistsError } from '../domain/index.js';
import type { ProductRepository } from './product.repository.js';
import { type ProductView, toProductView } from './product.view.js';

export type CreateProductInput = Omit<NewProduct, 'id'>;

export class CreateProductUseCase implements UseCase<CreateProductInput, ProductView> {
  constructor(
    private readonly products: ProductRepository,
    private readonly newId: () => string,
  ) {}

  async execute(input: CreateProductInput): Promise<ProductView> {
    const product = Product.create({ ...input, id: this.newId() });

    if (await this.products.findBySku(product.sku.value)) {
      throw new SkuAlreadyExistsError(product.sku.value);
    }

    await this.products.save(product);
    return toProductView(product);
  }
}
