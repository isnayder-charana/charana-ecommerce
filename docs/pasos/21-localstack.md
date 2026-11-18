# Paso 21 (fase 3): AWS en tu PC con LocalStack

## Qué hicimos

Preparamos la "tubería" de eventos de la fase 3, pero corriendo en tu PC con **LocalStack**, un emulador de AWS en un contenedor de Docker. Todavía no hay código nuevo en la API: en este paso solo creamos los recursos y aprendemos a usarlos a mano. En el paso 22 la API empezará a publicar eventos de verdad.

```
compose.yaml                                # LocalStack ya no es opcional: arranca con pnpm infra:up
.env.example                                # LOCALSTACK_AUTH_TOKEN
infra/local/localstack/
├─ 01-create-resources.sh                   # crea el bus, las reglas, las colas, el tema SNS…
└─ test-event.json                          # un evento de prueba para publicarlo a mano
```

Recursos que se crean al arrancar (los mismos nombres que tendrán en AWS en la fase 4):

| Recurso | Para qué |
| --- | --- |
| Bus de EventBridge `charanatech` | Por donde pasan todos los eventos de la tienda |
| Cola SQS `charanatech-notifications` + `-dlq` | Correos al cliente (paso 24) |
| Cola SQS `charanatech-fulfillment` + `-dlq` | Envío simulado del pedido (paso 25) |
| Cola SQS `charanatech-events-log` | "Espía" que recibe todos los eventos, para que los veas. Solo existe en local |
| 3 reglas de EventBridge | Deciden qué evento va a qué cola |
| Tema SNS `charanatech-alerts` | Avisos al administrador cuando algo falla (paso 26) |
| Bucket S3 `charanatech-product-images` | Imágenes de productos (fase 5) |
| Remitente SES `no-reply@charanatech.local` | El "de" de los correos (paso 24) |

## Los conceptos, en corto

```
                                    ┌─ regla: OrderPaid, OrderShipped,     ─► SQS charanatech-notifications ─► (paso 24: correos)
API ── evento OrderPaid ──► BUS ────┤          OrderDelivered, OrderCancelled      └─ 3 fallos ─► DLQ
   (source: charanatech.orders)     ├─ regla: OrderPaid, OrderShipped      ─► SQS charanatech-fulfillment   ─► (paso 25: envío)
                                    │                                              └─ 3 fallos ─► DLQ
                                    └─ regla: todo de charanatech.orders   ─► SQS charanatech-events-log (para mirar)
```

- **Evento:** un aviso de "algo pasó", en pasado: *OrderPaid* (el pedido se pagó). No es una orden ("envía el correo"): quien publica no sabe quién escucha.
- **EventBridge (el bus):** recibe eventos y los reparte según **reglas**. Cada regla es un patrón, por ejemplo "`source` = `charanatech.orders` y `detail-type` = `OrderPaid`", y un destino.
- **SQS (las colas):** guardan los mensajes hasta que alguien los procesa. Si el consumidor está caído, los mensajes esperan; si falla, el mensaje vuelve a la cola y se reintenta.
- **DLQ (cola de fallidos):** si un mensaje falla **3 veces**, SQS lo mueve a la DLQ. Así un mensaje "envenenado" no bloquea la cola ni se reintenta para siempre, y queda guardado 14 días para investigar.
- **SNS (temas):** "publica una vez, avisa a muchos". Lo usaremos para mandar alertas al administrador.

**¿Por qué EventBridge + SQS y no solo SQS?** Con EventBridge, la API publica **un** evento y no sabe quién lo usa. Si mañana agregamos "sumar puntos de fidelidad", es una regla y una cola nuevas, sin tocar la API. La cola delante de cada consumidor da reintentos, DLQ y aguante si llegan muchos eventos de golpe.

**¿Por qué una regla por consumidor y no una para todos?** Cada consumidor recibe solo lo que le interesa (al envío no le importa `OrderDelivered`) y cada uno tiene su propia cola: si el de correos se cae, el de envíos sigue trabajando.

**El permiso de la cola.** En AWS, EventBridge no puede dejar mensajes en una cola si la cola no lo autoriza. El script le pone a cada cola una *queue policy* que dice "el servicio `events.amazonaws.com` puede enviar mensajes, pero **solo desde esta regla**". LocalStack no lo exige, pero lo dejamos igual que en producción para no tener sorpresas en la fase 4.

## Prepara LocalStack (una sola vez)

Desde marzo de 2026, LocalStack exige una cuenta. Para proyectos personales y no comerciales como este, el plan **Hobby** es gratis e incluye EventBridge, SQS, SNS, SES (v1), S3 y Lambda.

1. Crea tu cuenta en **app.localstack.cloud** y elige el plan **Hobby** (no comercial).
2. En **Settings → Auth Tokens**, copia tu token personal.
3. En el archivo **`.env` de la raíz del repo** (no el de `apps/api`), agrega o completa esta línea:

   ```bash
   LOCALSTACK_AUTH_TOKEN=ls-...
   ```

   Ese archivo está en `.gitignore`: el token no se sube a Git. No lo compartas: es personal.

4. Levanta todo:

   ```bash
   pnpm infra:up
   ```

   La primera vez descarga la imagen (alrededor de 1 GB). `infra:up` espera a que los tres contenedores estén "healthy". Para LocalStack eso significa que el script de inicio **terminó**, no solo que el puerto responde.

Si te equivocas con el token, LocalStack se detiene con `License activation failed`. Lo ves con `docker compose logs localstack`.

### Un perfil de AWS CLI para LocalStack

Para no escribir la dirección de LocalStack en cada comando, crea un perfil `localstack` en tu AWS CLI. Funciona igual en PowerShell y en Git Bash:

```bash
aws configure set aws_access_key_id test --profile localstack
aws configure set aws_secret_access_key test --profile localstack
aws configure set region us-east-2 --profile localstack
aws configure set endpoint_url http://localhost:4566 --profile localstack
```

Las claves `test` son inventadas: LocalStack acepta cualquiera y nada sale a tu cuenta real de AWS. Tu perfil `charanatech` (el de `aws login`) no se toca.

## Pruébalo

Con `pnpm infra:up` corriendo, desde la raíz del repo:

1. **Mira lo que se creó:**

   ```bash
   aws --profile localstack events list-rules --event-bus-name charanatech --query "Rules[].Name"
   aws --profile localstack sqs list-queues
   ```

   Ves las 3 reglas y las 5 colas (2 de trabajo, sus 2 DLQ y la espía).

2. **Publica un evento a mano**, como lo hará la API en el paso 22:

   ```bash
   aws --profile localstack events put-events --entries file://infra/local/localstack/test-event.json
   ```

   La respuesta trae `"FailedEntryCount": 0`.

3. **Mira a dónde llegó.** Pide la dirección de la cola de correos y lee un mensaje:

   ```bash
   aws --profile localstack sqs get-queue-url --queue-name charanatech-notifications
   aws --profile localstack sqs receive-message --queue-url <la QueueUrl de arriba>
   ```

   En `Body` está el evento completo, con `"detail-type": "OrderPaid"` y tu `detail`. Repite con `charanatech-fulfillment` y `charanatech-events-log`: el evento llegó a las tres colas, porque las tres reglas lo aceptan.

4. **Cambia el tipo de evento.** Edita `test-event.json`, pon `"DetailType": "OrderDelivered"` y publícalo otra vez. Ahora llega a `notifications` y a `events-log`, pero **no** a `fulfillment`: su regla no incluye `OrderDelivered`. Vuelve a dejar `OrderPaid` al terminar.

5. **(Opcional) Con interfaz gráfica.** Con LocalStack corriendo, entra a **app.localstack.cloud → Resource Browser**. Ahí ves el bus, las colas y sus mensajes, como en la consola de AWS.

Un detalle de `receive-message`: el mensaje no se borra al leerlo. Queda invisible 30 segundos (el *visibility timeout*) y luego vuelve a la cola. Así funciona SQS: si el consumidor no confirma que terminó (borrando el mensaje), se reintenta. Por eso, si repites el comando enseguida, no lo ves, y a los 30 segundos sí.

## Cómo lo probé

No hay código nuevo en la API, así que `pnpm check` sigue igual. El script de inicio lo ejecuté contra **moto** (otro emulador de AWS) con la AWS CLI. Creó todo sin errores, y un `OrderPaid` publicado llegó a las tres colas, mientras que un `OrderDelivered` llegó a `notifications` y `events-log` pero no a `fulfillment`. También comprobé que la imagen `localstack/localstack:2026.10.7` se descarga y que, sin token, se detiene con el mensaje de licencia. Con tu token, la prueba de punta a punta es la sección de arriba.
