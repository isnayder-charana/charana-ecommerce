# Paso 7 (parte 3): Orders con DynamoDB

## Qué hicimos

Los pedidos ya pueden guardarse en **DynamoDB**. Igual que con el catálogo, agregamos un segundo adaptador para el puerto `OrderRepository`, **`DynamoDbOrderRepository`**, junto al de memoria. `PERSISTENCE=database` ahora usa **MySQL para el catálogo y DynamoDB para los pedidos**. Los casos de uso no cambiaron.

```
apps/api/
├─ src/shared/infrastructure/database/
│  ├─ dynamodb.ts                      # cliente, definición de la tabla y ensureTable()
│  └─ database.module.ts               # ahora entrega Prisma Y DynamoDB, y cierra ambos
├─ src/modules/orders/
│  ├─ domain/order.ts                  # nuevo campo version (bloqueo optimista)
│  └─ infrastructure/persistence/
│     └─ dynamodb-order.repository.ts  # ADAPTADOR DynamoDB del puerto OrderRepository
├─ src/scripts/create-dynamodb-table.ts  # pnpm db:tables
└─ test/integration/dynamodb-order.repository.integration-spec.ts
```

## Por qué DynamoDB para pedidos y MySQL para el catálogo

- **Catálogo:** necesita búsquedas flexibles (texto, categoría, orden por nombre) y transacciones sobre varios productos a la vez (reservar stock). Eso es terreno de SQL.
- **Pedidos:** siempre se leen de la misma forma ("este pedido" o "los pedidos de este cliente") y un pedido se lee y escribe completo. DynamoDB responde esas consultas en milisegundos sin importar cuántos pedidos haya, se paga por petición (casi 0 USD con poco tráfico) y no necesita conexiones abiertas, lo que encaja muy bien con Lambda.

En DynamoDB **primero se piensan las consultas y luego la tabla**. Al revés que en SQL.

## El diseño de la tabla

Usamos **una sola tabla** (*single-table design*) con claves genéricas. En la fase 2 el carrito vivirá en la misma tabla con otros prefijos.

| Atributo | Valor para un pedido | Para qué sirve |
|---|---|---|
| `PK` | `ORDER#<id>` | Clave de partición: leer un pedido por id (`findById`) |
| `SK` | `ORDER` | Clave de orden (aquí fija; el carrito usará otras) |
| `GSI1PK` | `CUSTOMER#<idCliente>` | Índice secundario: todos los pedidos de un cliente |
| `GSI1SK` | `ORDER#<fecha ISO>#<id>` | Ordena esos pedidos por fecha |

- `findById` hace un `GetItem` con `ConsistentRead: true`, es decir, una lectura directa por clave y siempre de la última versión.
- `findByCustomer` hace una `Query` sobre el índice `GSI1` con `ScanIndexForward: false`, que devuelve primero el pedido más nuevo. Si hay más de 1 MB de resultados, DynamoDB los entrega por páginas; el adaptador sigue pidiendo mientras haya `LastEvaluatedKey`.
- El pedido completo (líneas e historial incluidos) es **un solo item**. Es el mismo límite del agregado en el dominio: se lee y se guarda de una vez.

**Detalle a saber:** los índices secundarios globales son *eventualmente consistentes*. En AWS, un pedido recién creado puede tardar unos milisegundos en aparecer en "mis pedidos". `findById` no tiene ese problema porque lee la tabla principal.

## Bloqueo optimista con escrituras condicionales

Igual que `Product`, el agregado `Order` ahora tiene `version`. Así evitamos este problema: dos peticiones leen el mismo pedido a la vez, una lo **paga** y la otra lo **cancela**. Sin control, la segunda pisaría a la primera y el pedido pagado quedaría cancelado con su stock devuelto.

DynamoDB lo resuelve en una sola operación atómica con `ConditionExpression`:

```ts
// pedido nuevo: solo si todavía no existe ese id
ConditionExpression: 'attribute_not_exists(PK)'
// pedido existente: solo si nadie lo cambió desde que lo leímos
ConditionExpression: '#version = :expected'
```

Si la condición falla, DynamoDB lanza `ConditionalCheckFailedException`. El adaptador la traduce a `ConcurrencyError` del dominio, que la API devuelve como **409**. El adaptador en memoria aplica la misma regla, así que los tests unitarios se comportan igual.

Como `CancelOrderUseCase` guarda el pedido **antes** de devolver el stock, si dos cancelaciones llegan juntas solo una lo devuelve. Lo comprobamos con la API real: 5 cancelaciones simultáneas del mismo pedido dieron un 200 y cuatro 409.

## Variables de entorno nuevas

| Variable | Local | En AWS |
|---|---|---|
| `AWS_REGION` | `us-east-1` | La define Lambda automáticamente |
| `DYNAMODB_ENDPOINT` | `http://localhost:8000` | Vacía (usa el DynamoDB real) |
| `DYNAMODB_TABLE` | `charanatech` | La que cree Terraform |

Con `DYNAMODB_ENDPOINT` el cliente usa credenciales de mentira (`local`), que DynamoDB Local acepta. En AWS no hay llaves en el código: Lambda usa los permisos de su rol IAM.

## Versiones fijadas

| Paquete | Versión |
|---|---|
| @aws-sdk/client-dynamodb / @aws-sdk/lib-dynamodb | 3.1164.0 |

`lib-dynamodb` es el *Document Client*: convierte objetos JavaScript normales al formato de DynamoDB (`{ S: "texto" }`, `{ N: "12" }`) y de vuelta. La versión 3.1166.0 salió hoy y pnpm la bloquea por su política de antigüedad mínima (protección contra paquetes comprometidos recién publicados), así que usamos la 3.1164.0.

## Tests

- Unitarios: 110 (3 nuevos), con cobertura cercana al 100%. Los adaptadores reales quedan fuera de la cobertura unitaria, igual que el de Prisma.
- Integración: 16 en total, 6 nuevos contra DynamoDB Local. Cubren la lectura completa, el orden por fecha, el cambio de estado, el pedido desactualizado, el id repetido y **10 cancelaciones simultáneas donde solo una gana**.

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech
pnpm install
pnpm infra:up                        # MySQL + DynamoDB Local
cd apps\api
copy .env.example .env               # si ya tenías .env, agrega las 3 variables de DynamoDB
pnpm db:deploy                       # tabla products en MySQL
pnpm db:seed                         # 6 productos
pnpm db:tables                       # tabla charanatech en DynamoDB Local
pnpm test:integration                # 16 tests (MySQL + DynamoDB)
pnpm dev
```

Y en otra terminal:

```powershell
curl.exe -X POST http://localhost:3000/api/orders -H "Authorization: Bearer dev:ana" -H "Content-Type: application/json" -d "{\"items\":[{\"productId\":\"7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1001\",\"quantity\":1}]}"
curl.exe http://localhost:3000/api/orders -H "Authorization: Bearer dev:ana"
```

Si reinicias la API, los pedidos siguen ahí: ya no viven en memoria.
