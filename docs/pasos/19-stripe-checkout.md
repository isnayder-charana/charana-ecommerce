# Paso 19 (fase 3): pagar con Stripe Checkout

## Qué hicimos

El detalle de un pedido pendiente ahora tiene el botón **"Pagar con Stripe"**:

1. La tienda pide a la API una **sesión de Stripe Checkout** para ese pedido.
2. La API arma la sesión con los precios **guardados en el pedido** y devuelve solo una URL.
3. El navegador va a la página de pago de Stripe. El cliente paga con la tarjeta de prueba.
4. Stripe lo devuelve a `/pedidos/<id>?pago=exito` (o `?pago=cancelado` si se arrepintió).

Todavía falta una pieza: que **Stripe le avise a la API** que el pago se completó. Eso es el webhook del paso 20. Por ahora, después de pagar el pedido sigue en **Pendiente de pago**, aunque en el panel de Stripe ya ves el pago.

```
apps/api/src/
├─ config/env.ts                               # + STRIPE_SECRET_KEY (solo sk_test_) y STORE_URL
├─ shared/domain/domain-error.ts               # + tipo de error "unavailable" → HTTP 503
└─ modules/orders/
   ├─ domain/order.ts                          # + paymentSessionId, isPayable, attachPaymentSession()
   ├─ domain/order.errors.ts                   # + OrderNotPayableError (409)
   ├─ application/payment.gateway.ts           # PUERTO PaymentGateway + PaymentsNotConfiguredError
   ├─ application/start-checkout.use-case.ts   # abre o reutiliza la sesión de pago
   └─ infrastructure/
      ├─ http/orders.controller.ts             # + POST /api/orders/:id/checkout
      └─ payments/
         ├─ stripe-payment.gateway.ts          # ADAPTADOR con el SDK de Stripe
         ├─ unconfigured-payment.gateway.ts    # sin clave: responde 503
         └─ fake-payment.gateway.ts            # para los tests

apps/web/src/
├─ lib/navigation.ts                           # goTo(url): salir hacia Stripe
├─ components/ui/form-alert.tsx                # + tono "info"
├─ app/pedidos/[id]/page.tsx                   # lee ?pago=exito | cancelado
└─ features/orders/
   ├─ pay-button.tsx                           # el botón "Pagar con Stripe"
   ├─ orders.queries.ts                        # + startCheckout()
   └─ order-detail.tsx                         # botón + avisos al volver de Stripe
```

Dependencia nueva en la API: `stripe` **23.1.0** (el SDK oficial para Node).

## Prepara Stripe (una sola vez)

1. Crea tu cuenta en **dashboard.stripe.com/register** y confirma tu correo. No actives los pagos reales: solo usamos el **modo prueba** (Sandbox).
2. En el panel, ve a **Developers → API keys** y copia la **Secret key**, que empieza con `sk_test_`.
3. Pégala en `apps/api/.env` (ese archivo está en `.gitignore`, no se sube a Git):

   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STORE_URL=http://localhost:3001
   ```

4. Reinicia la API.

La clave **publicable** (`pk_test_…`) no la necesitamos: con Checkout, el navegador nunca habla con Stripe directamente, solo sigue la URL que le da la API.

## El viaje de un pago

```
Navegador                         API (OrderHub)                         Stripe
─────────                         ──────────────                         ──────
clic "Pagar con Stripe"
POST /api/orders/<id>/checkout ─► verifica el token
(sin cuerpo: no manda montos)     ¿el pedido es tuyo y está pendiente?
                                  ¿ya tiene una sesión abierta? → la reusa
                                  si no: crea la sesión ───────────────► checkout.sessions.create
                                         precios del pedido, en centavos   (expira en 30 min)
                                         metadata: orderId
                                  ◄──────────────────────────── { id, url }
                                  guarda paymentSessionId en el pedido
◄────────────────── { url } ──────
va a checkout.stripe.com ────────────────────────────────────────────► página de pago
paga con 4242 4242 4242 4242
◄──────────────────────── vuelve a /pedidos/<id>?pago=exito ──────────
                                  (paso 20: Stripe avisa a la API por webhook → Pagado)
```

## Las decisiones importantes

**El monto lo pone el servidor.** El navegador solo dice "quiero pagar el pedido X". La API toma las líneas guardadas en el pedido (con el precio del momento de la compra) y se las pasa a Stripe. Aunque alguien edite la página o la petición, no puede pagar menos.

**Los datos de la tarjeta nunca pasan por nosotros.** La página de pago es de Stripe (Checkout "alojado"). Así no guardamos ni vemos tarjetas, y no necesitamos la certificación PCI DSS que exigen los bancos a quien procesa tarjetas.

**Una sola sesión por pedido.** La API guarda el `paymentSessionId` en el pedido. Si el cliente vuelve a hacer clic en "Pagar", pregunta a Stripe si esa sesión sigue abierta y la reutiliza. Así evitamos dos páginas de pago abiertas para el mismo pedido, que podrían terminar en un cobro doble. Si dos clics llegan exactamente a la vez, el **bloqueo optimista** del paso 7c deja guardar solo uno; el otro recibe 409.

**La sesión expira en 30 minutos** (lo mínimo que permite Stripe). En el paso 20, cuando Stripe avise que expiró, el pedido se cancelará solo y el stock volverá a la tienda.

**Solo claves de prueba.** `env.ts` rechaza cualquier clave que no empiece con `sk_test_` o `rk_test_`. Si alguien pegara una clave real (`sk_live_…`) por error, la API no arranca: esta tienda es una demo y nunca debe cobrar dinero real.

**Sin clave, la API igual arranca.** Usa el adaptador `UnconfiguredPaymentGateway`, que responde **503** con el código `PAYMENTS_NOT_CONFIGURED`. La tienda lo traduce a "Los pagos no están disponibles en este momento". Es el mismo patrón de puertos y adaptadores que usamos con Cognito: el caso de uso no sabe si detrás hay Stripe, nada o un doble de prueba.

**El `orderId` viaja dentro de Stripe.** Lo mandamos como `client_reference_id` y en la `metadata` de la sesión y del pago. En el paso 20, cuando llegue el webhook, así sabremos qué pedido se pagó.

| La API responde | La tienda muestra |
| --- | --- |
| 200 `{ url }` | va a la página de pago de Stripe |
| 409 `ORDER_NOT_PAYABLE` | "Este pedido ya no se puede pagar." (ya pagado o cancelado) |
| 503 `PAYMENTS_NOT_CONFIGURED` | "Los pagos no están disponibles en este momento." |
| otro error | "No pudimos abrir la página de pago. Inténtalo otra vez." |

## Pruébalo

Con la API y la tienda corriendo (`pnpm --filter @charanatech/api dev` y `pnpm --filter @charanatech/web dev`):

1. Crea un pedido desde el carrito. En el detalle aparece **"Pagar con Stripe"**.
2. Haz clic: se abre la página de Stripe con tus productos y el total correcto.
3. Paga con:
   - Tarjeta: `4242 4242 4242 4242`
   - Fecha: cualquiera futura (por ejemplo `12/34`)
   - CVC: cualquiera (por ejemplo `123`)
   - Correo y nombre: cualquiera
4. Vuelves a la tienda con el aviso "Stripe está confirmando tu pago". El pedido sigue **Pendiente de pago** hasta el paso 20.
5. En el panel de Stripe, en **Transactions** (o **Payments**), ves el pago de prueba con el monto exacto.
6. Crea otro pedido, haz clic en "Pagar" y luego en la flecha **←** de Stripe para volver sin pagar: verás "No se completó el pago".
7. Haz clic dos veces en "Pagar" del mismo pedido (volviendo con ←): Stripe abre **la misma sesión**, no una nueva.
8. Quita `STRIPE_SECRET_KEY` del `.env` y reinicia la API: "Pagar" muestra "Los pagos no están disponibles". Vuelve a ponerla.

Otras tarjetas de prueba útiles: `4000 0000 0000 9995` (rechazada por fondos insuficientes) y `4000 0025 0000 3155` (pide autenticación 3D Secure).

## Tests

- **Dominio:** el pedido recuerda su sesión, lee pedidos antiguos sin ella y no deja pagar uno cancelado.
- **Caso de uso:** precios y URLs de vuelta correctos, reutiliza la sesión abierta, crea otra si expiró, rechaza pedidos ajenos o cancelados, 503 sin Stripe.
- **Adaptador de Stripe:** con un doble del SDK verificamos exactamente qué le pedimos a Stripe (centavos, `orderId`, expiración en segundos), sin salir a internet.
- **Configuración:** rechaza `sk_live_…` y exige la clave en producción.
- **e2e:** `POST /api/orders/:id/checkout` sin clave responde 503 `PAYMENTS_NOT_CONFIGURED`.
- **Tienda:** el botón llama a la API sin mandar montos y redirige a Stripe; cada error muestra su mensaje; solo aparece en pedidos pendientes; avisos de `?pago=exito` y `?pago=cancelado`.

`pnpm check` pasa: 128 tests en la API y 126 en la tienda.
