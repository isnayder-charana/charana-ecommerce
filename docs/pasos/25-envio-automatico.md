# Paso 25 (fase 3): el pedido avanza solo

## Qué hicimos

Después de pagar, ya nadie tiene que hacer clic para que el pedido avance. El worker `fulfillment` (el "almacén" simulado) lo mueve solo:

```
Pagado ──(15 s en el almacén)──► Enviado ──(15 s en camino)──► Entregado
```

En cada paso llega el correo del paso 24, y la página del pedido se actualiza sola. Es la demo que verá un reclutador: paga con la tarjeta de prueba y ve el pedido moverse delante de sus ojos.

```
apps/api/src/
├─ modules/orders/application/fulfill-order.use-case.ts       # enviar / entregar, idempotente
├─ modules/orders/infrastructure/http/internal-orders.controller.ts  # POST /api/internal/orders/:id/fulfillment
└─ shared/infrastructure/auth/internal-api-key.ts             # clave interna (X-Internal-Key)
apps/workers/src/
├─ fulfillment/orders-api.ts        # puerto: "pídele a la API que avance el pedido"
├─ fulfillment/fulfill-order.ts     # OrderPaid → enviar; OrderShipped → entregar
└─ shared/http-orders-api.ts        # adaptador HTTP con la clave interna
apps/web/src/features/orders/order.ts  # refreshInterval(): cada cuánto volver a mirar el pedido
infra/local/localstack/01-create-resources.sh  # la cola de fulfillment ahora tiene retraso
```

## Cómo funciona

```
API ── OrderPaid ──► EventBridge ──► SQS charanatech-fulfillment (DelaySeconds = 15)
                                            │ 15 s después
                                            ▼
                        worker fulfillment ── POST /api/internal/orders/:id/fulfillment {"step":"ship"}
                                            │      (cabecera X-Internal-Key)
                                            ▼
                        API: order.ship() ─► outbox ─► OrderShipped ─► EventBridge ─► (otra vez la cola, 15 s)
                                                                                         └─► "deliver"
```

### 1. ¿Quién cambia el estado? La API, no el worker

El worker podría escribir directo en DynamoDB, pero se saltaría todo lo que construimos: la máquina de estados, el bloqueo optimista y el outbox. Entonces nadie publicaría `OrderShipped` y no saldría el correo. La API es la **dueña** del pedido: el worker solo le **pide** que lo avance, por HTTP.

### 2. Una ruta interna con clave, no con Cognito

El worker no es una persona: no tiene usuario ni token de Cognito. Para "servicio a servicio" usamos una **clave compartida** en la cabecera `X-Internal-Key`:

- La ruta es `@Public()` para Cognito, pero sin la clave correcta responde **401**. Con un token de cliente, también 401.
- Si el servidor no tiene clave configurada responde **503**: la ruta nunca queda abierta por olvido. En producción, `env.ts` exige la clave.
- La comparación es de **tiempo constante** (`timingSafeEqual`). Un `===` normal termina antes cuando el primer carácter ya no coincide, y midiendo tiempos alguien podría adivinar la clave de a poco.
- No aparece en Swagger: no es una ruta para personas.

Alternativas que descarté:
- **Cognito "machine to machine"** (client credentials): es lo más estándar, pero en Cognito tiene un costo por cliente y por token.
- **Que el worker importe el código de la API**: acopla dos programas que se despliegan por separado.

En AWS (fase 4) la clave irá en Secrets Manager o SSM. Además se podría proteger la ruta con IAM en API Gateway, para que solo el rol de la Lambda pueda llamarla.

### 3. La espera la hace la cola, no un `setTimeout`

Un worker que espera 15 s con `setTimeout` está ocupado sin hacer nada, y en Lambda pagas ese tiempo. En cambio, la cola `charanatech-fulfillment` tiene **`DelaySeconds = 15`**: cada mensaje nuevo queda oculto 15 s antes de que el worker pueda leerlo. El worker solo trabaja cuando hay algo que hacer.

El retraso se configura en el script de LocalStack con `FULFILLMENT_DELAY_SECONDS` (15 por defecto; SQS permite hasta 900).

### 4. Idempotente y a prueba de cancelaciones

`FulfillOrderUseCase` acepta pedidos repetidos sin error:

| El pedido está… | `ship` | `deliver` |
| --- | --- | --- |
| PAID | → SHIPPED | error 409 (no se entrega lo que no salió) |
| SHIPPED | nada (`changed: false`) | → DELIVERED |
| DELIVERED | nada | nada |
| CANCELLED | nada | nada |

- Si el mismo `OrderPaid` llega dos veces, la segunda vez responde "nada que hacer". El evento repetido no es un error y no se reintenta.
- Si el cliente **cancela mientras el pedido espera en la cola**, el almacén ve `CANCELLED` y no lo envía.
- Si cancelan **en el mismo instante** en que el almacén lo envía, el bloqueo optimista deja ganar a uno. El otro recibe 409, SQS reintenta y en el segundo intento ve el estado final.

### 5. La tienda se actualiza sola

La página del pedido vuelve a preguntar a la API:

- cada 2 s al volver de Stripe, hasta ver el pago (paso 20);
- **cada 5 s mientras el pedido está Pagado o Enviado**;
- nunca cuando está Entregado o Cancelado, porque ya no cambia solo.

Con la pestaña en segundo plano, TanStack Query no pregunta, así que no gasta peticiones.

Es *polling*, la opción más simple. Lo "ideal" serían WebSockets o *server-sent events*, pero en Lambda + API Gateway eso agrega bastante infraestructura para una mejora que aquí no se nota.

## Configuración

1. **Genera una clave** (no la pegues en el chat ni la subas a git):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Ponla, **la misma**, en los dos archivos:

   ```
   # apps/api/.env
   INTERNAL_API_KEY=<la clave>

   # apps/workers/.env
   INTERNAL_API_KEY=<la clave>
   API_URL=http://localhost:3000/api
   ```

   Sin clave, los workers no arrancan y te dicen qué falta.

3. **Reinicia LocalStack** para que la cola tome el retraso:

   ```bash
   docker compose restart localstack
   ```

   Espera a que esté `healthy` (`docker compose ps`).

4. Reinicia la API y los workers.

## Pruébalo

1. Compra y paga un pedido con la tarjeta `4242 4242 4242 4242`. Quédate en la página del pedido.
2. Mira cómo cambia solo: **Pagado → Enviado** (unos 15 s) **→ Entregado** (otros 15 s). En "Seguimiento" aparece cada paso con su hora.
3. En la terminal de los workers:

   ```
   [fulfillment] Pedido … enviado
   [notifications] Correo "Tu pedido va en camino · Pedido …" enviado a …
   [fulfillment] Pedido … entregado
   [notifications] Correo "Tu pedido fue entregado · Pedido …" enviado a …
   ```

   Los 3 correos están en http://localhost:4566/_aws/ses.

4. **Cancela a tiempo.** Paga otro pedido y cancélalo antes de 15 s. El almacén dice `nada que hacer (ya está CANCELLED)`, el pedido no se envía y Stripe devuelve el dinero (paso 20).
5. **(Opcional) Clave equivocada.** Cambia un carácter de `INTERNAL_API_KEY` solo en `apps/workers/.env`, reinicia los workers y paga un pedido. La API responde 401, el worker lo reintenta 3 veces y el mensaje termina en `charanatech-fulfillment-dlq`. El pedido se queda en Pagado. Así se ve un fallo de configuración en un sistema con colas. Deja la clave bien al terminar.

## Cómo lo probé

- **API (190 pruebas):**
  - `FulfillOrderUseCase`: envía y entrega dejando historial y eventos, no hace nada si ya está hecho o cancelado, y la máquina de estados sigue rechazando "entregar sin enviar".
  - `InternalApiKey`: clave correcta, distinta, de otro largo o ausente, y servidor sin clave (503).
  - e2e: con la clave envía y entrega, y repetir no cambia nada. Sin clave, con otra clave o con token de cliente responde 401. También 400, 404 y 409, y la ruta no aparece en Swagger.
- **Workers (33 pruebas):** qué paso pide cada evento, el adaptador HTTP (URL, cabecera y cuerpo; cualquier respuesta no 2xx es error) y la clave obligatoria al arrancar.
- **Tienda (131 pruebas):** `refreshInterval()` en cada estado.
- **De punta a punta en el contenedor**, con la API real (MySQL + DynamoDB Local), EventBridge/SQS emulados con un retraso de 10 s y los workers:
  - el pedido pasó solo PAID → SHIPPED (11 s) → DELIVERED (11 s), con los 3 correos;
  - un pedido cancelado durante la espera no se envió (`nada que hacer (ya está CANCELLED)`).
- `pnpm check` pasa.
- **Arreglo de paso:** los tests e2e de la API leían tu `apps/api/.env`. Con `PERSISTENCE=database` o con `INTERNAL_API_KEY` puesta, el resultado dependía de tu PC. Ahora, con `NODE_ENV=test` (lo pone Jest), la API ignora el `.env` y los tests dan lo mismo en cualquier máquina.

## Para la entrevista

- *"¿Cómo se comunican tus servicios internos sin un usuario?"* → Con una clave compartida en una cabecera, comparada en tiempo constante. Si falta configuración responde 503, nunca queda abierta. En AWS iría en Secrets Manager, o se usaría IAM.
- *"¿Por qué el worker no cambia el pedido directo en la base?"* → Porque la API es la dueña de las reglas (máquina de estados, bloqueo optimista, outbox). Si el worker escribe directo, se salta todo eso y nadie publica el siguiente evento.
- *"¿Cómo programas una tarea para dentro de 15 segundos?"* → Con el retraso de la cola SQS (`DelaySeconds`), no con un temporizador: el worker no paga tiempo esperando.
