# Paso 7 (parte 2): Catalog con Prisma y MySQL

## Qué hicimos

El catálogo ya puede guardarse en **MySQL**. Agregamos un segundo adaptador para el puerto `ProductRepository`, **`PrismaProductRepository`**, junto al de memoria. La variable `PERSISTENCE` elige cuál se usa. **El dominio y los casos de uso no cambiaron**, salvo por un campo nuevo, `version`, que explico más abajo.

```
apps/api/
├─ prisma/
│  ├─ schema.prisma                 # la tabla products
│  └─ migrations/20261110213835_init/migration.sql
├─ prisma.config.ts                 # configuración del CLI de Prisma
├─ src/generated/prisma/            # cliente generado (no se sube a git)
├─ src/shared/infrastructure/database/
│  ├─ prisma.ts                     # crea el PrismaClient con el driver de MySQL
│  └─ database.module.ts            # lo comparte con toda la app y lo cierra al apagar
├─ src/modules/catalog/infrastructure/persistence/
│  └─ prisma-product.repository.ts  # ADAPTADOR MySQL del puerto ProductRepository
├─ src/scripts/seed.ts              # carga los 6 productos de ejemplo
└─ test/integration/                # tests contra MySQL real
```

## Prisma 7 en dos ideas

1. **`schema.prisma`** describe la tabla. `prisma migrate dev` compara el esquema con la base y genera un archivo **SQL de migración**, que se sube a git. En AWS se aplica con `prisma migrate deploy`. Así la base de datos tiene historial de cambios igual que el código.
2. **`prisma generate`** crea un cliente con tipos exactos de tu tabla en `src/generated/prisma`. Prisma 7 ya no usa un motor en Rust: habla con MySQL a través de un **driver adapter** (`@prisma/adapter-mariadb`). Es más liviano, y eso importa en Lambda.

El cliente generado no se sube a git. Se regenera solo después de `pnpm install` (script `postinstall`).

## La tabla

```sql
CREATE TABLE `products` (
  `id` CHAR(36) PRIMARY KEY,
  `sku` VARCHAR(32) UNIQUE,                       -- el índice único impide SKU repetidos
  `price_cents` INTEGER UNSIGNED,                 -- centavos, nunca negativos
  `stock` INTEGER UNSIGNED,                       -- MySQL también impide stock negativo
  `version` INTEGER UNSIGNED DEFAULT 1,           -- bloqueo optimista
  INDEX (`category`, `name`),                     -- filtrar por categoría y ordenar por nombre
  FULLTEXT INDEX (`name`, `description`),         -- búsqueda de texto
  ...
)
```

La categoría es un `VARCHAR` y no un `ENUM` de MySQL: la lista de categorías válidas vive en el **dominio** (`CATEGORIES`). Agregar una categoría no debería requerir una migración.

## Lo más importante: concurrencia y bloqueo optimista

**El problema:** quedan 3 audífonos y dos clientes compran 3 al mismo tiempo. Ambos leen "stock = 3", ambos restan 3 y ambos guardan "stock = 0". Vendiste 6 audífonos que no tienes.

**La solución: bloqueo optimista.** Cada fila tiene un número `version`. Al guardar:

```sql
UPDATE products SET stock = 0, version = version + 1
WHERE id = ? AND version = 7      -- solo si nadie la cambió desde que la leí
```

El primero en guardar cambia la versión a 8. El segundo no encuentra ninguna fila con `version = 7` (0 filas afectadas) y recibe un **`ConcurrencyError`**. Entonces `CatalogStockGateway` espera unos milisegundos al azar, **vuelve a leer** el stock (ahora 0) y el dominio responde "stock insuficiente" (409).

Se llama "optimista" porque no bloquea la fila mientras trabajas: asume que el choque es raro y lo detecta al final. Es ideal para un e-commerce, donde casi siempre hay stock de sobra.

Además, `saveAll` guarda varios productos dentro de una **transacción** de MySQL: si un producto del carrito choca, se deshacen todos.

**Lo probé:** con 25 audífonos en stock, lancé **10 compras simultáneas de 3 unidades** contra la API con MySQL. Resultado: **8 pedidos creados, 2 "stock insuficiente" y stock final 1**. Nunca se vende de más. Lo repetí y dio lo mismo, y también está como test de integración.

El repositorio en memoria aplica la misma regla de versiones, así que los tests unitarios se comportan igual que MySQL.

## Búsqueda con FULLTEXT

El adaptador usa el índice `FULLTEXT` de MySQL (`MATCH ... AGAINST` en modo booleano), que es mucho más rápido que `LIKE '%texto%'` cuando hay miles de productos.

El modo booleano trata ciertos caracteres como operadores: `-` significa "excluir". Si alguien busca `usb-c`, MySQL entendería "usb pero NO c". Por eso `toFulltextQuery` **limpia la entrada**:

| El usuario escribe | Se envía a MySQL | Significado |
|---|---|---|
| `Cable USB-C` | `+cable* +usb*` | debe contener "cable…" Y "usb…" |
| `teclad` | `+teclad*` | encuentra "Teclado" (búsqueda por prefijo) |
| `-* "+` | *(nada)* | sin palabras útiles: devuelve todo |

Las palabras de menos de 3 letras se descartan porque MySQL no las indexa.

## Tests

| Suite | Comando | Necesita Docker | Qué prueba |
|---|---|---|---|
| Unitarios + e2e | `pnpm test:cov` (dentro de `pnpm check`) | No | 107 tests: dominio, casos de uso, HTTP, versiones en memoria, reintentos y limpieza de la búsqueda |
| Integración | `pnpm --filter @charanatech/api test:integration` | Sí | 10 tests contra MySQL: SKU duplicado, FULLTEXT, paginación, bloqueo optimista, rollback de la transacción y 10 compras simultáneas |

Los tests de integración usan la base `charanatech_test`: no tocan tus datos de desarrollo. Antes de correrlos, la suite aplica las migraciones con `prisma migrate deploy`.

## Variables nuevas

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `PERSISTENCE` | `memory` en local, `database` en producción | Qué adaptador usar. En producción, `memory` está prohibido |
| `DATABASE_URL` | (obligatoria con `database`) | `mysql://charanatech:charanatech@localhost:3306/charanatech` |

Por ahora `PERSISTENCE=database` solo afecta a **Catalog**. Orders sigue en memoria hasta la parte 3 (DynamoDB).

## Versiones fijadas

| Paquete | Versión |
|---|---|
| prisma / @prisma/client / @prisma/adapter-mariadb | 7.10.1 |

Usamos la versión estable 7.10.1, no la 8.0 que todavía está en *release candidate*.

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech
pnpm install                         # también genera el cliente de Prisma
pnpm infra:up                        # MySQL + DynamoDB
cd apps\api
copy .env.example .env               # PERSISTENCE=database
pnpm db:deploy                       # crea la tabla products
pnpm db:seed                         # carga los 6 productos
pnpm test:integration                # 10 tests contra MySQL
pnpm dev
curl.exe "http://localhost:3000/api/products?q=usb-c"
```

**Importante:** si ya habías levantado MySQL con `pnpm infra:up` antes de esta parte, borra su volumen una vez con `docker compose down -v`. El script inicial de MySQL cambió (ahora da permisos para la *shadow database* de Prisma) y solo se ejecuta con un volumen vacío.
