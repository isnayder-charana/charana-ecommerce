import type { UseCase } from '../../../shared/application/use-case.js';
import type { ProductRepository, ProductSearchCriteria } from './product.repository.js';
import { type ProductView, toProductView } from './product.view.js';

export interface ProductListView {
  items: ProductView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class ListProductsUseCase implements UseCase<ProductSearchCriteria, ProductListView> {
  constructor(private readonly products: ProductRepository) {}

  async execute(criteria: ProductSearchCriteria): Promise<ProductListView> {
    const { items, total } = await this.products.search(criteria);
    return {
      items: items.map(toProductView),
      page: criteria.page,
      pageSize: criteria.pageSize,
      total,
      totalPages: Math.ceil(total / criteria.pageSize),
    };
  }
}
