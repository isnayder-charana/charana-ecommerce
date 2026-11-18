# Paso 22 (fase 3): la API publica sus eventos (outbox + EventBridge)

## Qué hicimos

Desde este paso, cada cambio de un pedido (creado, pagado, enviado, entregado, cancelado) sale como **evento** hacia el bus `charanatech` de EventBridge, el que creamos en LocalStack en el paso 21. Todavía nadie los consume: los workers llegan en el paso 23. Por ahora los vemos llegar a la cola espía `charanatech-events-log`.

Lo importante no es "publicar", sino publicar **sin perder ni inventar eventos**. Para eso usamos el patrón **transactional outbox** (bandeja de salida).

```
apps/api/src/modules/orders/
├─ application/
│  ├─ order-events.ts                 # OrderEvent (evento de integración) + puertos OutboxStore y EventPublisher
│  └─ publish-outbox.use-case.ts      # el relé: lee la bandeja → publica → borra
└─ infrastructure/
   ├─ persistence/
   │  ├─ dynamodb-order.repository.ts # guarda pedido + eventos en UNA transacción (TransactWriteItems)
   │  ├─ dynamodb-outbox.repository.ts# la bandeja en DynamoDB (PK = OUTBOX)
   │  └─ in-memory-outbox.store.ts    # la bandeja en memoria (tests y PERSISTENCE=memory)
   └─ events/
      ├─ eventbridge-event.publisher.ts # PutEvents al bus (AWS o LocalStack)
      ├─ logging-event.publisher.ts     # con PERSISTENCE=memory: solo escribe en el log
      └─ outbox-relay.service.ts        # corre el relé cada segundo mientras la API está encendida
```

## El problema: la "doble escritura"

Al pagar un pedido hay que hacer **dos** cosas: guardar el pedido como PAID en DynamoDB y avisar al bus. Son dos sistemas distintos, y no existe una transacción que abarque los dos. Mira qué pasa si lo hacemos "a lo simple":

| Orden | Si la API se cae en medio… |
| --- | --- |
| 1. guardar pedido, 2. publicar evento | El pedido queda PAID pero **nadie se entera**: no hay correo ni envío. Evento perdido. |
| 1. publicar evento, 2. guardar pedido | Sale el correo "¡pagado!" pero el guardado falla (por ejemplo, otro proceso lo canceló). Evento **falso**. |

No hace falta que "se caiga el servidor": basta con que EventBridge tarde, que haya un error de red o que Lambda corte la ejecución.

## La solución: outbox

```
             ┌────────────── UNA transacción en DynamoDB ──────────────┐
PayOrder ──► │ PUT pedido (version = 2, si sigue en version 1)        │
             │ PUT OUTBOX / 2026-11-17T…#<id>  { type: OrderPaid … }   │
             └──────────────────────────────────────────────────────────┘
                                   │
                relé (cada 1 s) ───┘ lee la bandeja ─► PutEvents al bus ─► borra de la bandeja
```

1. El evento se guarda **en la misma base y en la misma transacción** que el pedido. Con `TransactWriteItems`, DynamoDB aplica las escrituras todas o ninguna. Si el bloqueo optimista falla, no queda ni el pedido ni el evento.
2. Un **relé** revisa la bandeja, publica lo que encuentre y **solo después** lo borra.
3. Si el bus no responde, los eventos esperan en la bandeja y se reintentan en la siguiente vuelta. La API sigue vendiendo con normalidad.

### "Al menos una vez" (at-least-once)

Si la API se cae justo **después** de publicar y **antes** de borrar, el relé publicará ese evento otra vez. El outbox garantiza que ningún evento se pierde, pero alguno puede llegar **repetido**. Por eso cada evento lleva un `id` único, y los consumidores (paso 23) anotarán los ids que ya procesaron: es la misma idempotencia que usamos con los avisos de Stripe en el paso 20.

> Garantizar "exactamente una vez" entre sistemas distintos no es posible en la práctica. Lo que se hace es "al menos una vez" + consumidores idempotentes, que en efecto es lo mismo.

### Evento de dominio vs. evento de integración

- **De dominio** (`orders.OrderPaid`): lo genera la entidad `Order` en la fase 1. Solo dice qué pasó y cuándo, y vive dentro de la API.
- **De integración** (`OrderEvent`): es lo que sale al bus. Lleva un `id` único y una "foto" del pedido (`orderId`, `customerId`, `status`, `total`), para que el worker no tenga que volver a llamar a la API.

`toOrderEvents()` traduce uno en otro al guardar.

### Cómo está guardada la bandeja

En la misma tabla única `charanatech`:

| PK | SK | event |
| --- | --- | --- |
| `OUTBOX` | `2026-11-17T15:04:05.123Z#4f1c…` | `{ id, type: "OrderPaid", orderId, … }` |

Todos los pendientes comparten `PK = OUTBOX` y la `SK` empieza por la fecha, así que una sola Query los devuelve **del más antiguo al más nuevo**. Ojo: una sola partición sirve para esta tienda, pero con miles de pedidos por segundo habría que repartirla.

### ¿Y en AWS?

En la fase 4 el relé no será un `setInterval`. Se usará **DynamoDB Streams**: DynamoDB avisa a una Lambda cada vez que se escribe un item `OUTBOX`, sin estar preguntando cada segundo. El caso de uso `PublishOutboxUseCase` es el mismo; solo cambia quién lo dispara. Esa es la ventaja de la arquitectura hexagonal.

## Variables nuevas (apps/api/.env)

Agrega o cambia estas líneas en tu `apps/api/.env` (están en `.env.example`):

```
AWS_REGION=us-east-2
EVENTBRIDGE_ENDPOINT=http://localhost:4566
EVENT_BUS_NAME=charanatech
OUTBOX_RELAY_INTERVAL_MS=1000
```

- `AWS_REGION` pasa de `us-east-1` a `us-east-2`, la región de LocalStack y Cognito. Tus pedidos de DynamoDB Local no se pierden: el contenedor usa `-sharedDb`, que ignora la región.
- Si te olvidas de `EVENTBRIDGE_ENDPOINT`, la API intentará publicar en el AWS real y fallará. Los eventos se quedarán en la bandeja, y verás un aviso en el log.

## Pruébalo

Necesitas `pnpm infra:up` (MySQL, DynamoDB y LocalStack) y la API y la tienda encendidas, igual que en el paso 20 (con `stripe listen` para el pago).

1. **Vacía la cola espía**, para ver solo lo nuevo:

   ```bash
   aws --profile localstack sqs purge-queue --queue-url http://sqs.us-east-2.localhost.localstack.cloud:4566/000000000000/charanatech-events-log
   ```

   Si la dirección no coincide, pídela con `aws --profile localstack sqs get-queue-url --queue-name charanatech-events-log`.

2. **Compra y paga** un pedido en la tienda con la tarjeta `4242 4242 4242 4242`. En la consola de la API aparecen, un segundo después de cada cambio:

   ```
   [Outbox] 1 evento(s) publicados en el bus
   ```

3. **Mira los eventos en la cola espía:**

   ```bash
   aws --profile localstack sqs receive-message --queue-url <la dirección de arriba> --max-number-of-messages 10
   ```

   Ves dos mensajes: `"detail-type": "OrderPlaced"` y `"detail-type": "OrderPaid"`, con tu pedido en `detail`. El `OrderPaid` también está en `charanatech-notifications` y en `charanatech-fulfillment`: ahí lo leerán los workers de los pasos 24 y 25.

4. **El experimento importante: apaga el bus.**

   ```bash
   docker compose stop localstack
   ```

   Crea otro pedido en la tienda. La compra funciona igual, y la API muestra **un solo** aviso:

   ```
   [Outbox] No se pudo publicar (se reintentará): …
   ```

   El evento está guardado en la bandeja. Míralo en DynamoDB Local:

   ```bash
   aws --profile localstack --endpoint-url http://localhost:8000 dynamodb query --table-name charanatech --key-condition-expression "PK = :pk" --expression-attribute-values "{\":pk\":{\"S\":\"OUTBOX\"}}"
   ```

   En PowerShell, las comillas del último valor van así: `'{\"":pk\"":{\""S\"":\""OUTBOX\""}}'`. Si se complica, abre la tabla en **NoSQL Workbench** (Operation builder → tabla `charanatech` → Query con PK = `OUTBOX`).

5. **Vuelve a encender el bus:**

   ```bash
   docker compose start localstack
   ```

   Cuando LocalStack termina de arrancar, la API dice `El bus de eventos volvió a responder` y publica lo pendiente. La bandeja queda vacía y el `OrderPlaced` aparece en `charanatech-events-log`. **No se perdió nada.**

   Un detalle: LocalStack (en el plan gratis) no guarda nada al apagarse, así que el script del paso 21 vuelve a crear el bus y las colas al arrancar. Por eso los mensajes viejos de las colas desaparecen, pero el evento nuevo llega.

## Cómo lo probé

- **Unitarias:**
  - `toOrderEvents` (traducción y foto del pedido).
  - La bandeja en memoria (orden y límite).
  - El relé: publica por tandas de 25; si el bus falla **no borra nada**; con la bandeja vacía no publica.
  - `EventBridgePublisher` con un cliente falso: tandas de 10 (el límite de `PutEvents`), `source` y `detail-type` correctos. Si EventBridge rechaza una entrada sin lanzar error (`FailedEntryCount`), lanzamos nosotros.
  - El servicio del relé: avisa una sola vez por racha de fallos, no se pisa consigo mismo y se detiene al cerrar la API.
- **e2e:** pagar un pedido con el webhook y correr una vuelta del relé publica `OrderPlaced` y `OrderPaid`, y la siguiente vuelta no los repite.
- **Integración (DynamoDB Local):**
  - Pedido y eventos se guardan en la misma transacción.
  - Si el bloqueo optimista falla, **no quedan eventos huérfanos**.
  - La bandeja devuelve los más antiguos primero y borra en lotes.
  - Las 10 cancelaciones simultáneas siguen dando 1 ganador y 9 `ConcurrencyError`. Con transacciones, DynamoDB puede responder `TransactionConflict` en vez de `ConditionalCheckFailed`, y ahora tratamos los dos igual.
- **Contra un EventBridge emulado (moto)** con el script del paso 21: un `OrderPaid` publicado por el adaptador llegó a las tres colas, y un `OrderPlaced` solo a `events-log`.
- `pnpm check`: API 164 pruebas, web 128; integración 21.

## Para la entrevista

- *"¿Cómo garantizas que un evento se publica si el pedido se guardó?"* → Transactional outbox: el evento se escribe en la misma transacción que el pedido y un relé lo publica después. Entrega al menos una vez, con consumidores idempotentes por id de evento.
- *"¿Por qué no publicas directamente después de guardar?"* → Es una doble escritura: dos sistemas sin transacción común. Si algo falla en medio, pierdes el evento o publicas uno falso.
