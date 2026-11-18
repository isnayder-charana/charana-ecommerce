# Paso 24 (fase 3): correos al cliente con SES

## Qué hicimos

El worker `notifications` ya no solo escribe en el log: **envía un correo** al cliente cada vez que su pedido cambia de estado, con Amazon SES (en tu PC, el SES de LocalStack).

| Evento | Asunto |
| --- | --- |
| `OrderPaid` | Recibimos tu pago · Pedido A1B2C3D4 |
| `OrderShipped` | Tu pedido va en camino · Pedido … |
| `OrderDelivered` | Tu pedido fue entregado · Pedido … |
| `OrderCancelled` | Tu pedido fue cancelado · Pedido … |

`OrderPlaced` no envía correo: el pedido todavía no está pagado.

Para eso hubo que resolver primero una pregunta: **¿cuál es el correo del cliente?** El pedido solo guardaba su id (`sub` de Cognito).

```
apps/web/src/features/
├─ auth/session.ts, cognito-auth.ts, dev-auth.ts   # nuevo: idToken()
└─ orders/checkout-button.tsx, checkout.actions.ts # envían el ID token al crear el pedido
apps/api/src/
├─ shared/infrastructure/auth/                      # TokenVerifier.emailOf(): verifica el ID token
└─ modules/orders/
   ├─ domain/order.ts                               # customerEmail (foto, como el precio)
   ├─ application/order-events.ts                   # el evento lleva customerEmail
   └─ infrastructure/http/orders.controller.ts      # lee la cabecera X-Id-Token
apps/workers/src/
├─ shared/email.ts                                  # puerto EmailSender
├─ shared/ses-email-sender.ts                       # adaptador SES (SendEmail, API v1)
└─ notifications/
   ├─ order-email.ts                                # plantillas: asunto, texto y HTML
   └─ notify-customer.ts                            # el worker
```

## De dónde sale el correo: el ID token

Cognito entrega **dos** tokens al iniciar sesión:

| Token | Para qué | ¿Trae el correo? |
| --- | --- | --- |
| **Access token** | Autorizar llamadas a la API (va en `Authorization`) | **No** |
| **ID token** | Decir quién es la persona (nombre, correo) | **Sí** |

Opciones que consideré:

1. **Que la tienda envíe el correo en el cuerpo del pedido.** Descartado: el navegador puede mentir. Alguien podría hacer que los correos de sus pedidos le lleguen a otra persona.
2. **Que el worker busque el correo en Cognito con el `sub`** (`ListUsers`). Funciona en AWS, pero en tu PC el worker necesitaría credenciales reales de AWS, y cada correo sería una llamada más.
3. **Elegida: la tienda envía también el ID token al crear el pedido** (cabecera `X-Id-Token`). La API verifica su **firma** con las mismas llaves públicas de Cognito y comprueba que su `sub` sea el **mismo** del access token. Recién ahí guarda el correo en el pedido.

Así el correo es tan confiable como el login, la API no llama a AWS para obtenerlo y queda en el pedido como una **foto del momento de la compra**, igual que el precio. Si la persona cambia de correo después, sus pedidos viejos siguen avisando al correo con el que compró, como en cualquier tienda.

- Un ID token inválido o de otra persona → **401** y no se crea el pedido.
- Sin ID token → el pedido se crea igual, solo que sin avisos. Lo mismo para los pedidos que hiciste antes de este paso: el worker dice `sin correo: no se avisa`.
- En modo dev (`AUTH_MODE=dev`) el "ID token" es el mismo `dev:ana`, y el correo es `ana@ejemplo.dev`, el que ya mostraba la tienda.
- El correo no aparece en las respuestas de la API, y en el log del worker sale enmascarado (`a***@correo.com`): es un dato personal.

## El worker y SES

```
SQS charanatech-notifications ─► createSqsHandler (paso 23) ─► notifyCustomer ─► EmailSender (puerto)
                                                                                   └─ SesEmailSender ─► SES
```

- **Puerto `EmailSender`**: la lógica del worker no importa nada de AWS (el linter lo prohíbe desde el paso 23). Así los tests usan una bandeja falsa, y si mañana cambiamos SES por otro proveedor solo cambia el adaptador.
- **SES v1 (`@aws-sdk/client-ses`)**: LocalStack gratis solo trae la API v1 de SES (ver paso 21). En AWS ambas funcionan.
- **Texto + HTML**: cada correo va en las dos versiones. El HTML lleva estilos en línea porque muchos clientes de correo ignoran `<style>`, y todos los valores se escapan.
- **Si SES falla**, el error sube. Gracias al paso 23, el mensaje se reintenta y, tras 3 fallos, va a la DLQ. El evento se anota como procesado **después** de enviar: en el peor caso, un correo puede salir dos veces, nunca cero.

### En AWS (fase 4): el "sandbox" de SES

Una cuenta nueva de SES está en **sandbox**: solo puede enviar a correos **verificados** y con un límite diario bajo. Para que cualquier reclutador reciba el correo hay que pedir a AWS el **acceso de producción** (un formulario explicando el uso). Si no lo aprueban, el plan B es mostrar los avisos en la página del pedido. Esa decisión llega en la fase 4.

## Configuración

Agrega estas líneas a `apps/workers/.env` (también están en `.env.example`):

```
SES_ENDPOINT=http://localhost:4566
EMAIL_FROM=no-reply@charanatech.local
STORE_URL=http://localhost:3001
```

Si te olvidas de `SES_ENDPOINT`, el corredor local usa el mismo LocalStack que `SQS_ENDPOINT`. Nunca intenta enviar con el SES real desde tu PC.

Después, `pnpm install` en la raíz (hay un paquete nuevo).

## Pruébalo

Con `pnpm infra:up`, la API y la tienda en una terminal y los workers en otra (como en el paso 23):

1. **Cierra sesión y vuelve a entrar** en la tienda. No es obligatorio, pero así te aseguras de tener tokens nuevos.
2. **Compra y paga** un pedido. En la terminal de los workers:

   ```
   [notifications] Correo "Recibimos tu pago · Pedido 1A2B3C4D" enviado a i***@gmail.com
   ```

3. **Mira el correo.** LocalStack no envía correos a internet: los guarda. Ábrelos en el navegador:

   http://localhost:4566/_aws/ses

   Es un JSON con la lista `messages`: cada uno trae `Destination`, `Subject` y el `Body` con `text_part` y `html_part`. Para verlo como lo vería el cliente, copia el valor de `html_part` en un archivo `correo.html` y ábrelo en el navegador.

4. **Cancela** otro pedido pagado (o deja que una sesión de pago expire): llega `Tu pedido fue cancelado`, que también menciona el reembolso.
5. **(Opcional) Un pedido viejo.** Si pagas un pedido que creaste antes de este paso, el worker dice `Pedido … sin correo: no se avisa`. Es lo esperado: ese pedido no tiene correo guardado.

## Cómo lo probé

- **API (172 pruebas):**
  - El dominio normaliza el correo (`Ana@Correo.COM` → `ana@correo.com`), rechaza uno con forma inválida y lee pedidos sin correo.
  - El verificador de Cognito acepta un ID token de la misma persona y rechaza uno de otra persona, de otra app, mal firmado o un access token en su lugar. Usa las mismas llaves RSA de prueba de la fase 2.
  - e2e: con `X-Id-Token` el correo viaja en el evento. Con un ID token ajeno o basura responde 401 y no crea el pedido.
- **Tienda (128 pruebas):** el botón de compra envía los dos tokens; el cliente de la API agrega la cabecera.
- **Workers (29 pruebas):**
  - Las plantillas: asuntos, enlace, total y HTML escapado.
  - El adaptador SES, con un cliente falso: remitente, UTF-8, texto y HTML.
  - El worker: no envía sin correo ni para `OrderPlaced`, enmascara el correo en el log, y si SES falla el error sube para reintentar.
- **Contra SES y SQS emulados (moto):** un `OrderPaid` con correo publicado en el bus terminó en `Correo "Recibimos tu pago…" enviado`, y SES contó 1 correo enviado.
- `pnpm check` pasa; integración: API 21, workers 1.

## Para la entrevista

- *"¿De dónde sacas el correo del cliente? ¿No podría falsificarlo?"* → Del ID token de Cognito, que la API verifica (firma y mismo `sub` que el access token). Nunca de un campo que el navegador pueda escribir. Queda guardado en el pedido como una foto del momento de la compra.
- *"¿Qué pasa si SES falla?"* → El worker deja que el error suba, SQS reintenta y al tercer fallo el mensaje va a la DLQ. Se anota como procesado después de enviar: como mucho sale un correo repetido, nunca se pierde uno.
