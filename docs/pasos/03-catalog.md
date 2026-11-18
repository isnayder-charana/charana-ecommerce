# Paso 3: módulo Catalog

## Qué hicimos

El primer módulo de negocio: el **catálogo de productos**. Ya puedes listar, buscar, ver y crear productos por HTTP. Por ahora se guardan **en memoria** (6 productos de ejemplo); en el paso 7, con docker-compose, cambiaremos ese adaptador por **Prisma + MySQL** sin tocar el dominio ni los casos de uso.

```
src/modules/catalog/
├─ domain/                      # reglas de negocio puras
│  ├─ money.ts                  # objeto de valor: dinero en centavos
│  ├─ sku.ts                    # objeto de valor: código de inventario
│  ├─ product.ts                # agregado Product
│  └─ product.errors.ts         # errores de negocio
├─ application/                 # casos de uso + puertos
│  ├─ product.repository.ts     # PUERTO: interfaz del repositorio
│  ├─ product.view.ts           # lo que se devuelve al cliente
│  ├─ list-products.use-case.ts
│  ├─ get-product.use-case.ts
│  └─ create-product.use-case.ts
├─ infrastructure/              # adaptadores
│  ├─ http/                     # controlador + esquemas Zod
│  └─ persistence/              # repositorio en memoria + datos de ejemplo
└─ catalog.module.ts            # conecta puertos con adaptadores
```

## El dominio

### `Money` (objeto de valor)
El precio se guarda en **centavos enteros** (`5999` = USD 59.99). En JavaScript `0.1 + 0.2` da `0.30000000000000004`; con enteros eso nunca pasa. Además no deja crear montos negativos ni sumar USD con PEN.

### `Sku` (objeto de valor)
Normaliza (`" ct-aud-001 "` → `"CT-AUD-001"`) y valida el formato. Si un `Sku` existe, es válido: no hace falta volver a validarlo en ningún otro lado.

### `Product` (agregado)
- `Product.create(...)` es la única forma de crear un producto nuevo y aplica las reglas: nombre de 3+ caracteres, categoría válida, stock entero ≥ 0.
- `reserveStock(n)` descuenta stock y **nunca deja que quede negativo** (lanza `InsufficientStockError`). Registra el evento `catalog.StockReserved`. Lo usará Orders en el paso 4.
- `releaseStock(n)` devuelve stock (pedido cancelado o pago fallido).
- `toPrimitives()` / `fromPrimitives()` convierten a y desde un objeto plano, que es lo que guarda la base de datos.
- El constructor es `private`: nadie puede saltarse las reglas con `new Product(...)`.

### Errores de negocio
| Error | `kind` | HTTP |
|---|---|---|
| `InvalidProductError`, `InvalidMoneyError`, `InvalidSkuError` | `validation` | 400 |
| `ProductNotFoundError` | `not_found` | 404 |
| `SkuAlreadyExistsError`, `InsufficientStockError` | `conflict` | 409 |

## La aplicación: puerto y casos de uso

`ProductRepository` es un **puerto**: una interfaz que dice *qué* necesita la aplicación (`findById`, `findBySku`, `search`, `save`) pero no *cómo*. Los casos de uso solo conocen esa interfaz.

Los casos de uso **no usan decoradores de Nest**. Son clases normales que reciben el repositorio en el constructor. Por eso en los tests los creamos con `new ListProductsUseCase(repo)` sin levantar Nest.

`CreateProductUseCase` recibe también una función `newId`. En producción es `randomUUID`; en el test es `() => 'new-id'`, así el resultado es predecible.

## La infraestructura: adaptadores

- **Entrada HTTP** (`ProductsController`): recibe la petición, la valida con **Zod** y llama al caso de uso. No tiene lógica de negocio.
- **Salida de persistencia** (`InMemoryProductRepository`): implementa el puerto con un `Map`. Guarda objetos planos, igual que haría una base de datos real.
- **`ZodValidationPipe`** (en `shared/`): valida query, params o body y responde 400 con el detalle de cada campo inválido.

Hay **dos niveles de validación**, y es a propósito:
1. **Zod en HTTP**: la *forma* de los datos (¿`priceCents` es un número? ¿`category` existe?).
2. **Dominio**: las *reglas de negocio* (¿el precio es negativo? ¿el SKU tiene el formato correcto?). Esas reglas se cumplen venga el dato de HTTP, de una cola SQS o de un script.

## `catalog.module.ts`: donde se conecta todo

```ts
{ provide: PRODUCT_REPOSITORY, useFactory: () => new InMemoryProductRepository(PRODUCT_SEED) },
{
  provide: ListProductsUseCase,
  inject: [PRODUCT_REPOSITORY],
  useFactory: (repo) => new ListProductsUseCase(repo),
},
```

`PRODUCT_REPOSITORY` es un `Symbol` que sirve de "nombre" para el puerto. Cuando tengamos MySQL, solo cambiará la primera línea.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/products?q=&category=&page=&pageSize=` | Lista y busca (12 por página por defecto, máximo 50) |
| GET | `/api/products/:id` | Detalle de un producto (el id debe ser un UUID) |
| POST | `/api/products` | Crea un producto (en el paso 5 será solo para administradores) |

Categorías: `audio`, `cargadores`, `cables`, `perifericos`, `fundas`, `almacenamiento`.

## Tests

- **Dominio** (`money.spec.ts`, `sku.spec.ts`, `product.spec.ts`): reglas puras, sin nada más.
- **Casos de uso** (`catalog.use-cases.spec.ts`): con el repositorio en memoria.
- **e2e** (`test/catalog.e2e-spec.ts`): la app completa por HTTP con supertest (200, 400, 404, 409 y 201).

Resultado: **43 tests**, 100% de líneas y 94.5% de ramas cubiertas.

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech\apps\api
pnpm test:cov
pnpm dev
```

Luego, en otra terminal de PowerShell:

```powershell
curl.exe "http://localhost:3000/api/products?category=perifericos"
curl.exe "http://localhost:3000/api/products?q=usb-c"
curl.exe -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{\"sku\":\"CT-FUN-001\",\"name\":\"Funda MagSafe\",\"category\":\"fundas\",\"priceCents\":1999,\"stock\":30}'
```

Prueba también a romper las reglas: un `priceCents` negativo, un SKU repetido o una categoría inventada, y mira qué responde la API.
