# Paso 23 (fase 3): los workers que consumen los eventos

## Qué hicimos

En el paso 22 la API empezó a publicar eventos y EventBridge los dejaba en las colas. Ahora hay alguien que los lee: los **workers** del paquete `apps/workers`.

| Worker | Lee la cola | Qué hace hoy | Qué hará |
| --- | --- | --- | --- |
| `notifications` | `charanatech-notifications` | Escribe en el log el aviso para el cliente ("Recibimos tu pago"…) | Enviar el correo con SES (paso 24) |
| `fulfillment` | `charanatech-fulfillment` | Escribe en el log "se prepara el envío" | Pasar el pedido a Enviado y luego a Entregado (paso 25) |

Lo importante de este paso no es lo que hacen (todavía poco), sino **cómo** leen las colas sin perder mensajes, sin procesarlos dos veces y sin que un mensaje roto bloquee a los demás.

```
apps/workers/
├─ src/
│  ├─ shared/
│  │  ├─ order-event.ts                 # el contrato: valida con Zod el evento que llega
│  │  ├─ sqs-handler.ts                 # convierte un manejador en una Lambda para SQS (lotes, fallos parciales, idempotencia)
│  │  ├─ processed-events.ts            # puerto: ¿este worker ya procesó este evento?
│  │  ├─ dynamodb-processed-events.ts   # adaptador: lo anota en la tabla charanatech (con TTL)
│  │  ├─ sqs-poller.ts                  # el corredor local: hace lo que Lambda hace en AWS
│  │  ├─ logger.ts, env.ts
│  ├─ notifications/notify-customer.ts  # la lógica de cada worker (sin AWS dentro)
│  ├─ fulfillment/fulfill-order.ts
│  ├─ consumers.ts                      # conecta cada worker con su cola
│  ├─ lambda/                           # puntos de entrada de las Lambdas (fase 4)
│  └─ local.ts                          # punto de entrada en tu PC: `pnpm dev`
└─ test/
   ├─ support/fixtures.ts
   └─ integration/                      # contra DynamoDB Local
```

## Los conceptos, en corto

```
            EventBridge
                 │
                 ▼
     SQS charanatech-notifications ──(3 fallos)──► DLQ charanatech-notifications-dlq
                 │ lote de hasta 10
                 ▼
   en AWS: Lambda   ·   en tu PC: SqsPoller (local.ts)
                 │
                 ▼
   createSqsHandler ── por cada mensaje ──► ¿JSON válido? ¿ya procesado? ──► notifyCustomer(evento)
                 │
                 ▼
   { batchItemFailures: [solo los que fallaron] }
```

### 1. Lotes y "partial batch response"

Lambda no recibe un mensaje: recibe un **lote** (hasta 10). Si uno falla y la función lanza error, SQS reintenta el lote **entero**, y los 9 que salieron bien se procesan otra vez. La solución es responder con la lista de los que fallaron:

```ts
return { batchItemFailures: [{ itemIdentifier: 'id-del-mensaje-que-fallo' }] };
```

SQS borra los demás y solo reintenta esos. En AWS hay que activarlo en la conexión cola → Lambda (`ReportBatchItemFailures`), lo haremos en Terraform en la fase 4.

### 2. Reintentos, visibility timeout y DLQ

Cuando un worker recibe un mensaje, SQS no lo borra: lo **esconde** 30 segundos (visibility timeout). Si el worker confirma que terminó (lo borra), desaparece. Si no, vuelve a aparecer y se reintenta. Después de **3 intentos** (`maxReceiveCount` del paso 21), SQS lo mueve a la **DLQ** (dead-letter queue).

¿Para qué la DLQ? Un mensaje roto (un "poison message") se reintentaría para siempre. En la DLQ queda guardado para que alguien lo revise, y no estorba a los demás. En el paso 26 una alarma avisará por SNS cuando llegue algo ahí.

### 3. Idempotencia en el consumidor

El outbox (paso 22) entrega "al menos una vez", y SQS también. Así que un mismo evento puede llegar dos veces. Cada worker anota en DynamoDB los eventos que ya procesó:

```
PK = WORKER_EVENT#notifications#<id del evento>   SK = WORKER_EVENT   expiresAt = TTL (14 días)
```

- La clave lleva el **nombre del worker**, porque el mismo `OrderPaid` lo procesan `notifications` y `fulfillment`, cada uno por su lado.
- Se anota **después** de procesar, igual que los avisos de Stripe en el paso 20. Si el worker se cae a mitad de camino, el reintento lo vuelve a hacer.
- El costo: si dos copias llegan exactamente a la vez, las dos podrían pasar el "¿ya procesado?". Para un correo eso significa, como mucho, un correo repetido. Para cambiar el estado del pedido (paso 25), el bloqueo optimista de la API ya evita que se aplique dos veces.

### 4. El contrato se valida

El worker no confía en lo que llega: `parseOrderEvent()` revisa con Zod el sobre de EventBridge (`source` = `charanatech.orders`) y el evento de dentro. Un mensaje que no cumple se marca como fallido con "mensaje inválido" y termina en la DLQ.

### 5. ¿Por qué no Nest aquí?

Una Lambda debe arrancar rápido (el "cold start"). Los workers son funciones simples sin framework. Igual seguimos la idea hexagonal: la lógica (`notify-customer.ts`, `fulfill-order.ts`) no importa nada de AWS. El linter lo prohíbe (regla nueva en `biome.json`), y en el paso 24 SES entrará por un puerto.

### 6. Lambda en AWS, corredor en tu PC

En AWS, Lambda hace sola el trabajo de leer la cola, pasar el lote y borrar los buenos (el *event source mapping*). En tu PC no hay Lambda, así que `SqsPoller` hace lo mismo:

1. `ReceiveMessage` con **long polling** (espera hasta 20 s a que llegue algo, en vez de preguntar sin parar);
2. llama al **mismo** manejador que usará la Lambda;
3. borra los mensajes que salieron bien (`DeleteMessageBatch`).

Si LocalStack está apagado, avisa una vez y reintenta cada 5 segundos.

## Configuración

Crea `apps/workers/.env` copiando el ejemplo:

```bash
cp apps/workers/.env.example apps/workers/.env
```

No tiene secretos: solo dice dónde están LocalStack (`SQS_ENDPOINT`) y DynamoDB Local. Sin `SQS_ENDPOINT` el corredor no arranca, para que nunca lea por error las colas del AWS real.

Después, desde la raíz: `pnpm install` (paquetes nuevos).

## Pruébalo

Con `pnpm infra:up` corriendo:

1. **Enciende todo.** `pnpm dev` en la raíz ahora arranca también los workers. Si prefieres verlos en su propia terminal: `pnpm --filter @charanatech/workers dev`. Ves:

   ```
   [workers] notifications escuchando charanatech-notifications
   [workers] fulfillment escuchando charanatech-fulfillment
   ```

   Si justo al arrancar aparecen líneas `mensaje inválido`, son los eventos de prueba que publicaste en los pasos 21 y 22 con el formato viejo de `test-event.json` (no tenía `id` ni `total`). Tras 3 intentos se van a la DLQ; es justo lo que debe pasar. `test-event.json` ya tiene el formato completo.

2. **Compra y paga un pedido** en la tienda. Un par de segundos después del pago, en la terminal de los workers:

   ```
   [notifications] Aviso para el cliente <tu id>: "Recibimos tu pago" (pedido …)
   [notifications] OrderPaid del pedido … (evento …): procesado
   [fulfillment] Pedido … pagado: se prepara el envío
   [fulfillment] OrderPaid del pedido … (evento …): procesado
   ```

   Cancela otro pedido y verás `"Tu pedido fue cancelado"` solo en `notifications`: la regla de `fulfillment` no recibe `OrderCancelled`.

3. **Un evento repetido.** Publica dos veces el mismo evento a mano con el archivo del paso 21:

   ```bash
   aws --profile localstack events put-events --entries file://infra/local/localstack/test-event.json
   aws --profile localstack events put-events --entries file://infra/local/localstack/test-event.json
   ```

   La primera vez dice `procesado`; la segunda, `ya procesado, se ignora`.

   Si la primera ya dice "ya procesado", es porque lo publicaste antes: cambia el `"id"` dentro de `Detail` en `test-event.json` (por ejemplo, `prueba-evento-2`).

4. **Un mensaje roto va a la DLQ.** Mete basura directo en la cola:

   ```bash
   aws --profile localstack sqs get-queue-url --queue-name charanatech-notifications
   aws --profile localstack sqs send-message --queue-url <la QueueUrl> --message-body "no soy un evento"
   ```

   Los workers muestran `mensaje inválido (intento 1)`, y 30 segundos después `(intento 2)` y `(intento 3)`. Medio minuto después, el mensaje ya no está en la cola: está en la DLQ.

   ```bash
   aws --profile localstack sqs get-queue-url --queue-name charanatech-notifications-dlq
   aws --profile localstack sqs receive-message --queue-url <la QueueUrl de la DLQ>
   ```

   Ahí aparece `"Body": "no soy un evento"`. Mientras tanto, los pedidos normales se siguieron procesando sin problema.

5. **(Opcional) Workers apagados.** Detén los workers (Ctrl+C), paga un pedido y vuelve a encenderlos. Procesan el `OrderPaid` que esperaba en la cola: SQS lo guardó.

## Cómo lo probé

- **Unitarias (17 pruebas, 100 % de líneas):**
  - El contrato: JSON inválido, campos que faltan, tipo desconocido u otro `source`.
  - El manejador: procesa y anota, ignora repetidos y devuelve **solo** los mensajes fallidos. Un fallo no queda anotado, para que el reintento lo vuelva a intentar.
  - El corredor, con un SQS falso: borra solo los buenos, no llama al manejador con la cola vacía, avisa una vez si la cola no responde y se detiene con Ctrl+C.
  - Los dos workers y su conexión con las colas.
- **Integración (DynamoDB Local):** el registro de eventos procesados, separado por worker y con TTL.
- **De punta a punta contra SQS y EventBridge emulados (moto)**, con el script del paso 21 y los workers corriendo:
  - un `OrderPaid` publicado en el bus llegó a los dos workers;
  - el mismo evento otra vez se ignoró en los dos;
  - un mensaje basura falló 3 veces y terminó en `charanatech-notifications-dlq`.
- `pnpm check`: API 164, web 128, workers 17.

## Para la entrevista

- *"¿Qué pasa si un mensaje falla?"* → Se reintenta: SQS lo vuelve a mostrar tras el visibility timeout. Al tercer fallo va a la DLQ para revisarlo, sin bloquear la cola. Con *partial batch response* solo se reintenta el mensaje que falló, no el lote entero.
- *"¿Y si llega dos veces?"* → Cada worker anota el id del evento en DynamoDB, con TTL, y descarta los repetidos. La clave incluye el worker, porque cada uno procesa el evento por su cuenta.
