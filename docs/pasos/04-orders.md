# Paso 4: módulo Orders

## Qué hicimos

El corazón de OrderHub: **pedidos**. Un cliente compra productos del catálogo, se descuenta el stock y el pedido avanza por estados hasta entregarse. Este es el flujo que verá el reclutador.

Por ahora los pedidos se guardan **en memoria**. En el paso 7 cambiamos el adaptador por **DynamoDB** sin tocar el dominio.

```
src/modules/orders/
├─ domain/
│  ├─ order-status.ts            # máquina de estados
│  ├─ order-line.ts              # objeto de valor: una línea del pedido
│  ├─ order.ts                   # agregado Order
│  └─ order.errors.ts
├─ application/
│  ├─ order.repository.ts        # PUERTO: persistencia de pedidos
│  ├─ stock.gateway.ts           # PUERTO: hablar con Catalog
│  ├─ place-order.use-case.ts    # comprar
│  ├─ get-order.use-case.ts      # ver un pedido mío
│  ├─ list-my-orders.use-case.ts # mis pedidos
│  ├─ cancel-order.use-case.ts   # cancelar y devolver stock
│  └─ advance-order-status.use-case.ts  # pagar / enviar / entregar
├─ infrastructure/
│  ├─ catalog/catalog-stock.gateway.ts  # ADAPTADOR hacia Catalog
│  ├─ persistence/in-memory-order.repository.ts
│  └─ http/                      # controlador, esquemas Zod, decorador CustomerId
└─ orders.module.ts
```

## La máquina de estados

```
PENDING_PAYMENT ──pagar──▶ PAID ──enviar──▶ SHIPPED ──entregar──▶ DELIVERED
      │                      │
      └───────cancelar───────┴─────────▶ CANCELLED
```

Está escrita como una tabla en `order-status.ts` (`ALLOWED_TRANSITIONS`). El agregado solo cambia de estado si la tabla lo permite; si no, lanza `InvalidOrderTransitionError` (HTTP 409). Así es **imposible** entregar un pedido que no se pagó, pagar dos veces o cancelar algo que ya salió del almacén.

Cada cambio queda en `history` con su fecha. El frontend lo usará para mostrar la línea de tiempo del pedido. Cada cambio también registra un evento de dominio (`orders.OrderPaid`, `orders.OrderShipped`…) que en la fase 3 publicaremos en EventBridge.

## El agregado `Order`

- **`Order.place(...)`** valida: al menos 1 producto, máximo 20, sin productos repetidos, cantidades de 1 a 10 y una sola moneda. Calcula el total sumando subtotales con `Money`, es decir, en centavos y sin errores de redondeo.
- **`OrderLine` guarda una copia del nombre y del precio** al momento de comprar. Si mañana el cargador sube de precio, tu pedido de hoy sigue costando lo mismo. Es una regla clásica de e-commerce.
- **`isOwnedBy(customerId)`**: el pedido sabe quién es su dueño.

## Dos módulos que se hablan: el puerto `StockGateway`

Para comprar, Orders necesita reservar stock en Catalog. La tentación es usar `ProductRepository` directamente desde el caso de uso, pero eso acopla los módulos. En su lugar:

1. Orders define **su propio puerto**, `StockGateway`, con lo que *él* necesita: `reserve(items)` y `release(items)`.
2. `CatalogStockGateway` (en `infrastructure/`) lo implementa usando Catalog. Es una **capa anticorrupción**: traduce `Product` a `ReservedItem` (sku, nombre, precio, cantidad).

Si mañana Catalog fuera un microservicio aparte, solo se reescribe ese adaptador para llamar por HTTP.

La reserva es **todo o nada**: primero se valida el stock de todos los productos y solo después se guarda. Si el mouse no tiene stock, tampoco se descuentan los audífonos. Con MySQL esto irá dentro de una transacción.

## `PlaceOrderUseCase`: reservar, crear y compensar

```ts
const reserved = await this.stock.reserve(items);   // 1. reservar
try {
  const order = Order.place({ ... });               // 2. crear (valida reglas)
  await this.orders.save(order);
} catch (error) {
  await this.stock.release(items);                  // 3. si falla, devolver stock
  throw error;
}
```

El paso 3 se llama **compensación**. Como el stock (MySQL) y los pedidos (DynamoDB) estarán en bases de datos distintas, no hay una transacción que cubra ambos. Si algo falla a mitad de camino, deshacemos lo hecho a mano.

Los casos de uso reciben `newId` y `clock` (la hora actual) como funciones. En los tests usamos ids y horas fijas para que los resultados sean predecibles.

## Seguridad básica (por ahora)

- **Temporal**: el cliente se identifica con la cabecera `x-customer-id` (decorador `@CustomerId()`). En el paso 5 se reemplaza por el usuario del token JWT de Cognito, y los casos de uso no cambian.
- Si pides un pedido de otro cliente, la respuesta es **404**, no 403. Así no revelamos que ese pedido existe.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/orders` | Comprar: `{ "items": [{ "productId": "...", "quantity": 2 }] }` |
| GET | `/api/orders` | Mis pedidos (del más nuevo al más antiguo) |
| GET | `/api/orders/:id` | Un pedido mío, con su historial |
| POST | `/api/orders/:id/cancel` | Cancelar (devuelve el stock) |
| PATCH | `/api/orders/:id/status` | `{ "action": "pay" \| "ship" \| "deliver" }`. En el paso 5 será solo para admin; en la fase 3, "pay" lo hará el webhook de Stripe. |

## Tests

- `order.spec.ts`: reglas del pedido y todas las transiciones válidas e inválidas.
- `orders.use-cases.spec.ts`: compra con descuento de stock, todo o nada, compensación, pedidos ajenos y cancelación con devolución de stock.
- `test/orders.e2e-spec.ts`: el flujo completo por HTTP (comprar → pagar → enviar → entregar), 401, 404, 409 y 400.

Resultado total de la API: **72 tests**, 100% de líneas cubiertas.

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech\apps\api
pnpm test:cov
pnpm dev
```

En otra terminal de PowerShell:

```powershell
# Comprar 2 audífonos
$order = curl.exe -s -X POST http://localhost:3000/api/orders -H "x-customer-id: isnayder" -H "Content-Type: application/json" -d '{\"items\":[{\"productId\":\"7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1001\",\"quantity\":2}]}' | ConvertFrom-Json
$order

# Pagar y enviar
curl.exe -X PATCH "http://localhost:3000/api/orders/$($order.id)/status" -H "Content-Type: application/json" -d '{\"action\":\"pay\"}'
curl.exe -X PATCH "http://localhost:3000/api/orders/$($order.id)/status" -H "Content-Type: application/json" -d '{\"action\":\"ship\"}'

# Ver el historial
curl.exe "http://localhost:3000/api/orders/$($order.id)" -H "x-customer-id: isnayder"

# Intentar cancelar un pedido ya enviado → 409
curl.exe -X POST "http://localhost:3000/api/orders/$($order.id)/cancel" -H "x-customer-id: isnayder"
```
