# Paso 20 (fase 3): el webhook de Stripe marca el pedido como Pagado

## Qué hicimos

En el paso 19 el cliente ya podía pagar, pero la API no se enteraba. Ahora **Stripe le avisa a la API** con un *webhook*, una petición HTTP que Stripe envía a una URL nuestra cuando pasa algo:

| Aviso de Stripe | Qué hace la API |
| --- | --- |
| `checkout.session.completed` (pagado) | El pedido pasa a **Pagado** |
| `checkout.session.async_payment_succeeded` | Lo mismo, para métodos de pago que tardan |
| `checkout.session.expired` (30 min sin pagar) | Cancela el pedido y **devuelve el stock** |
| Cualquier otro | Responde 200 y lo ignora |

Además:

- **Cancelar un pedido pagado devuelve el dinero** (reembolso en Stripe).
- **Cancelar un pedido pendiente cierra su página de pago**, para que nadie pueda pagar un pedido cancelado.
- La tienda, al volver de Stripe, **consulta el pedido cada 2 segundos** hasta ver "¡Pago confirmado!".

```
apps/api/src/
├─ main.ts                                        # rawBody: true (para verificar la firma)
├─ config/env.ts                                  # + STRIPE_WEBHOOK_SECRET (whsec_…)
└─ modules/orders/
   ├─ application/
   │  ├─ payment-event.ts                         # PaymentEvent + PUERTO ProcessedEventStore
   │  ├─ handle-payment-event.use-case.ts         # qué hacer con cada aviso (idempotente)
   │  ├─ cancel-order.use-case.ts                 # + reembolso o cierre de la sesión
   │  └─ payment.gateway.ts                       # + expireCheckout, refundCheckout
   └─ infrastructure/
      ├─ http/payments-webhook.controller.ts      # POST /api/payments/webhook (@Public)
      ├─ payments/stripe-webhook.parser.ts        # verifica la firma y traduce el aviso
      ├─ payments/stripe-payment.gateway.ts       # + expire y refund con el SDK
      └─ persistence/
         ├─ dynamodb-processed-event.repository.ts  # avisos ya procesados (con TTL)
         └─ in-memory-processed-event.store.ts

apps/web/src/features/orders/order-detail.tsx     # consulta el estado al volver de Stripe
```

## Prepara Stripe CLI (una sola vez)

Stripe no puede llamar a `localhost`, porque tu PC no es accesible desde internet. **Stripe CLI** soluciona eso: se conecta a Stripe y te reenvía los avisos a tu API local.

1. Descarga el `.zip` para Windows (`stripe_X.Y.Z_windows_x86_64.zip`) desde **github.com/stripe/stripe-cli/releases/latest**.
2. Descomprímelo en una carpeta fija, por ejemplo `C:\Tools\stripe`, y agrega esa carpeta al **PATH** de Windows (Configuración → Sistema → Información → Configuración avanzada → Variables de entorno → Path → Nuevo).
3. Abre una terminal nueva y comprueba con `stripe --version`.
4. Ejecuta `stripe login`. Se abre el navegador; acepta el acceso para tu cuenta (Sandbox).

Cada vez que vayas a probar pagos, deja corriendo en una terminal aparte:

```bash
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired --forward-to localhost:3000/api/payments/webhook
```

`--events` dice qué avisos reenviar (las versiones nuevas de Stripe CLI lo exigen): solo los tres que maneja la API.

La primera línea muestra `Your webhook signing secret is whsec_...`. Cópialo en `apps/api/.env` y reinicia la API:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

Ese secreto no cambia entre una ejecución y otra de `stripe listen`, así que solo lo copias una vez. En la fase 4, en AWS, Stripe llamará directo a la URL pública de la API y el secreto saldrá del panel de Stripe.

## Cómo viaja un pago ahora

```
Navegador              Stripe                         stripe listen        API (OrderHub)
─────────              ──────                         ─────────────        ──────────────
paga en Checkout ────► cobra la tarjeta
◄── vuelve a /pedidos/<id>?pago=exito
                       checkout.session.completed ──► reenvía ───────────► POST /api/payments/webhook
                       (firmado con whsec_…)                               ¿la firma coincide? si no: 400
                                                                           ¿ya procesé evt_…? si sí: 200
                                                                           pedido → PAID (bloqueo optimista)
                                                                           guarda evt_… como procesado
                       ◄───────────────────────────────────────────────── 200 { received: true }
cada 2 s: GET /api/orders/<id> ───────────────────────────────────────────►
◄─────────────────────────────────────────────────────── status: PAID
"¡Pago confirmado!"
```

## Las decisiones importantes

**La firma es la seguridad.** El webhook es `@Public()`: Stripe no tiene un token de Cognito. A cambio, cada aviso trae la cabecera `Stripe-Signature`, un **HMAC-SHA256** del cuerpo calculado con el secreto `whsec_…` que solo conocen Stripe y nuestra API. Sin verificarla, cualquiera podría mandar un "pagado" falso y llevarse productos gratis. La verificación también rechaza avisos de más de 5 minutos, así nadie puede reenviar uno viejo que haya capturado.

**Necesitamos el cuerpo crudo.** El HMAC se calcula sobre los bytes **exactos** que mandó Stripe. Si Nest convierte el JSON a objeto y luego lo volvemos a serializar, un espacio o el orden de las claves cambiaría la firma. Por eso `main.ts` crea la app con `rawBody: true` y el controlador usa `req.rawBody`.

**Idempotencia: el mismo aviso puede llegar dos veces.** Stripe reintenta si no respondemos 200 a tiempo, y a veces entrega un aviso repetido. Guardamos el id de cada aviso procesado (`evt_…`) en DynamoDB (`PK = PAYMENT_EVENT#<id>`) y descartamos los repetidos. Además, el propio pedido protege: un pedido ya pagado no se vuelve a pagar.

**Se registra después de procesar, no antes.** Si la API se cae a mitad de camino, el aviso no queda marcado, Stripe reintenta y se procesa bien. Si dos copias llegan exactamente a la vez, el **bloqueo optimista** del pedido deja ganar a una; la otra responde error, Stripe la reintenta y la descarta como repetida.

**Responder 200 rápido y también para lo que ignoramos.** Si devolvemos error, Stripe reintenta durante 3 días. Para avisos que no nos interesan (o de sesiones que no creamos, como las de `stripe trigger`) respondemos 200 y listo.

**Los avisos viejos caducan solos.** Cada registro de aviso tiene `expiresAt` (30 días). En AWS, el **TTL** de DynamoDB borra esos items sin costo; en la fase 4 Terraform activará el TTL sobre ese atributo. DynamoDB Local lo ignora, pero no molesta.

**Expirar solo la sesión actual.** Si el cliente abrió una sesión, la dejó y luego abrió otra, la vieja puede expirar sin cancelar el pedido: solo cancelamos si la sesión que expiró es la que el pedido tiene guardada.

**Nunca quedarse con dinero de un pedido cancelado.**
- Cancelar un pedido **pendiente** cierra su sesión en Stripe (`sessions.expire`), así ya no se puede pagar.
- Cancelar un pedido **pagado** pide el reembolso. Usamos una **clave de idempotencia** (`refund-<sesión>`): si la API reintenta, Stripe devuelve el mismo reembolso en vez de hacer otro.
- Si aun así llega un pago para un pedido cancelado (una carrera de milisegundos), el webhook lo reembolsa automáticamente.

## Pruébalo

Ten corriendo, cada uno en su terminal: Docker (`pnpm infra:up`), la API, la tienda y `stripe listen` con el comando de arriba.

1. **Pago normal.** Crea un pedido, haz clic en "Pagar con Stripe" y paga con `4242 4242 4242 4242`. Al volver ves "Stripe está confirmando tu pago" y en uno o dos segundos cambia a **"¡Pago confirmado!"**. En la terminal de `stripe listen` aparece `checkout.session.completed` con `[200]`.
2. **Reembolso.** En ese pedido pagado, haz clic en "Cancelar pedido". El aviso dice "Te devolvemos el dinero". En el panel de Stripe, en el pago, verás **Refunded** (Reembolsado).
3. **Expiración.** Crea otro pedido y haz clic en "Pagar", pero no pagues. Copia el id de la sesión de la barra de direcciones: es la parte `cs_test_...` de `checkout.stripe.com/c/pay/cs_test_...` (hasta el `#`). En otra terminal:

   ```bash
   stripe checkout sessions expire cs_test_...
   ```

   Recarga el pedido: está **Cancelado** y el stock del producto volvió.
4. **Firma falsa.** Con la API corriendo, en Git Bash:

   ```bash
   curl -i -X POST localhost:3000/api/payments/webhook \
     -H "Content-Type: application/json" -H "Stripe-Signature: t=1,v1=falsa" -d '{}'
   ```

   Responde **400** `INVALID_PAYMENT_EVENT`.
El caso del **aviso repetido** no es fácil de provocar a mano; lo cubren los tests (unitarios y e2e).

Si un pago se queda en "confirmando", casi siempre es porque `stripe listen` no está corriendo o el `STRIPE_WEBHOOK_SECRET` no coincide (en ese caso `stripe listen` muestra `[400]`).

## Tests

- **Parser del webhook:** con avisos firmados de verdad (`Stripe.webhooks.generateTestHeaderString`) prueba la traducción de cada tipo, y rechaza avisos sin firma, con otro secreto o con el cuerpo modificado después de firmarlo.
- **Caso de uso:** pagado, aviso repetido, pago para un pedido cancelado (reembolsa), expiración que devuelve stock, sesión vieja que no cancela, y que un fallo al guardar no deja el aviso como procesado.
- **Cancelar:** cierra la sesión si estaba pendiente y reembolsa si estaba pagado.
- **e2e (`test/payments.e2e-spec.ts`):** la app completa recibe avisos firmados: paga una vez aunque llegue dos veces, rechaza firmas falsas con 400, expira y devuelve stock, y reembolsa al cancelar.
- **Integración (DynamoDB Local):** el pedido guarda su sesión de pago y el registro de avisos procesados con su `expiresAt`.
- **Tienda:** al volver con `?pago=exito` consulta hasta ver el pago, y avisa del reembolso al cancelar un pedido pagado.

`pnpm check` pasa: 151 tests en la API y 128 en la tienda. `pnpm --filter @charanatech/api test:integration`: 18 tests.
