import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { AdminOnly, Public } from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { CreateProductUseCase } from '../../application/create-product.use-case.js';
import { GetProductUseCase } from '../../application/get-product.use-case.js';
import { ListProductsUseCase } from '../../application/list-products.use-case.js';
import {
  createProductBodySchema,
  listProductsQuerySchema,
  productIdParamSchema,
} from './product.schemas.js';

/**
 * ADAPTADOR de entrada HTTP: traduce peticiones a llamadas a casos de uso.
 * No tiene lógica de negocio.
 */
@ApiTags('Catálogo')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly createProduct: CreateProductUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Busca productos (texto, categoría y paginación)' })
  list(
    @Query({ schema: listProductsQuerySchema })
    query: z.infer<typeof listProductsQuerySchema>,
  ) {
    return this.listProducts.execute({
      query: query.q,
      category: query.category,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Detalle de un producto' })
  get(@Param('id', { schema: productIdParamSchema }) id: string) {
    return this.getProduct.execute({ id });
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Crea un producto (solo admin)' })
  create(
    @Body({ schema: createProductBodySchema })
    body: z.infer<typeof createProductBodySchema>,
  ) {
    return this.createProduct.execute(body);
  }
}
