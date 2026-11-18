# Paso 26 (fase 3): alertas de la DLQ y la arquitectura completa

## Qué hicimos

Último paso de la fase 3. Hasta ahora, si un mensaje fallaba 3 veces terminaba en su **DLQ** (paso 23)… y nadie se enteraba. Un pedido podía quedarse en Pagado para siempre sin que nadie lo notara. Ahora:

1. Los workers **vigilan las DLQ** y, en cuanto llega algo, avisan al tema SNS `charanatech-alerts`.
2. El README tiene el **diagrama** de cómo funciona una compra de punta a punta.
3. Probé el **flujo completo** con todas las piezas encendidas.

```
apps/workers/src/
├─ alerts/dlq-monitor.ts          # la lógica: ¿hay algo en la DLQ? → avisar (sin AWS dentro)
├─ shared/sqs-queue-depth.ts      # adaptador: cuántos mensajes tiene una cola (SQS)
├─ shared/sns-alert-publisher.ts  # adaptador: publicar el aviso (SNS)
└─ local.ts                       # arranca el vigilante junto a los workers
infra/local/localstack/01-create-resources.sh  # cola espía charanatech-alerts-log suscrita al tema
README.md                         # diagrama "Cómo funciona una compra"
```

## Cómo funciona

```
SQS charanatech-notifications ──(3 fallos)──► charanatech-notifications-dlq
                                                     │ cada 30 s: ¿cuántos mensajes hay?
                                                     ▼
                                              DlqMonitor ── ALARMA ──► SNS charanatech-alerts
                                                                               │
                                       en tu PC: cola espía charanatech-alerts-log
                                       en AWS:   correo del administrador
```

### 1. Una alarma, no un aviso por mensaje

El vigilante se comporta como una **alarma de CloudWatch**: tiene dos estados, OK y ALARMA, y solo avisa cuando **cambia** de estado.

| La DLQ… | Aviso |
| --- | --- |
| estaba vacía y llega 1 mensaje | `[CharanaTech] ALARMA: charanatech-notifications-dlq tiene 1 mensaje(s)` |
| sigue con mensajes (o llegan más) | ninguno: es el mismo problema |
| queda vacía (alguien la revisó) | `[CharanaTech] Resuelto: charanatech-notifications-dlq vacia` |

Si llegaran 500 mensajes rotos, un aviso por mensaje llenaría la bandeja del administrador y acabaría ignorándolos. Con la alarma recibe **uno**.

Si publicar en SNS falla, la alarma no se da por avisada: lo intenta otra vez en la siguiente revisión.

### 2. ¿Por qué SNS y no un correo directo?

SNS es un "megáfono": el worker publica una vez y SNS lo reparte a todos los suscritos (correo, SMS, Slack, otra cola…). Para agregar otro destino no hace falta tocar el código, solo suscribirlo al tema.

En tu PC el suscriptor es la cola espía `charanatech-alerts-log`, para que puedas leer los avisos con la CLI.

### 3. En AWS (fase 4): CloudWatch hace este trabajo

En AWS no hará falta un proceso que pregunte cada 30 s. SQS publica sola la métrica `ApproximateNumberOfMessagesVisible` de cada cola, y Terraform creará una **alarma de CloudWatch** por DLQ (`> 0` → avisar a `charanatech-alerts`). La lógica es la misma que la de `DlqMonitor`; por eso se escribió igual que una alarma.

En tu PC no emulamos CloudWatch (sería un servicio más en LocalStack solo para esto), así que el vigilante corre dentro de los workers. Es el mismo trato que con el relé del outbox (paso 22): en local un proceso, en AWS un servicio administrado.

Una diferencia: el vigilante local olvida su estado al reiniciar. Si al arrancar ya hay mensajes viejos en una DLQ, avisa **otra vez**. CloudWatch sí recuerda el estado.

## Configuración

Agrega a `apps/workers/.env` (también está en `.env.example`):

```
SNS_ENDPOINT=http://localhost:4566
DLQ_CHECK_SECONDS=30
```

Si te olvidas de `SNS_ENDPOINT`, usa el mismo LocalStack que `SQS_ENDPOINT`.

Después:

1. `pnpm install` en la raíz (hay un paquete nuevo: `@aws-sdk/client-sns`).
2. `docker compose restart localstack`, para que el script cree la cola espía. Espera a que esté `healthy`.
3. Reinicia los workers. Ves una línea nueva:

   ```
   [workers] alertas vigilando charanatech-notifications-dlq, charanatech-fulfillment-dlq cada 30 s
   ```

## Pruébalo

### A. El flujo completo (el ensayo de la demo)

Es lo que hará un reclutador. Con `pnpm infra:up`, `stripe listen`, la API, la tienda y los workers encendidos:

1. Entra a la tienda (`http://localhost:3001`) e **inicia sesión**.
2. Agrega un producto al carrito y pulsa **Continuar compra**. El pedido queda **Pendiente de pago** y el stock baja.
3. Pulsa **Pagar** y usa la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC).
4. Al volver de Stripe, en la página del pedido, sin recargar:
   - en 1 o 2 s pasa a **Pagado** (webhook de Stripe → paso 20);
   - unos 15 s después, a **Enviado**;
   - otros 15 s después, a **Entregado**.
5. En http://localhost:4566/_aws/ses están los **3 correos**: pago, envío y entrega.
6. En la terminal de los workers, cada evento dice `procesado` en los dos workers, y no aparece ninguna `ALARMA`.

Si algún paso no ocurre, el diagrama del README te dice dónde mirar. Por ejemplo, si se queda en Pagado: ¿la API dice `[Outbox] … publicados`? ¿El worker `fulfillment` recibió el evento? ¿La clave interna es la misma en los dos `.env` (paso 25)?

### B. La alarma

1. **Rompe un mensaje.** Mete basura en la cola de correos:

   ```bash
   aws --profile localstack sqs get-queue-url --queue-name charanatech-notifications
   aws --profile localstack sqs send-message --queue-url <la QueueUrl> --message-body "no soy un evento"
   ```

2. En los workers aparecen `mensaje inválido (intento 1)`, `(intento 2)` e `(intento 3)`, cada 30 s. A lo mucho 30 s después:

   ```
   [alertas] ALARMA: charanatech-notifications-dlq tiene 1 mensaje(s). Aviso enviado por SNS
   ```

3. **Lee el aviso** que SNS dejó en la cola espía:

   ```bash
   aws --profile localstack sqs get-queue-url --queue-name charanatech-alerts-log
   aws --profile localstack sqs receive-message --queue-url <la QueueUrl de alerts-log>
   ```

   El `Body` es el sobre de SNS: trae `"Subject": "[CharanaTech] ALARMA: …"` y el `Message` con lo que hay que revisar.

4. **"Resuelve" el problema** vaciando la DLQ (en la vida real, primero revisarías los mensajes):

   ```bash
   aws --profile localstack sqs get-queue-url --queue-name charanatech-notifications-dlq
   aws --profile localstack sqs purge-queue --queue-url <la QueueUrl de la DLQ>
   ```

   En la siguiente revisión: `[alertas] Resuelto: charanatech-notifications-dlq está vacía`, y llega un segundo aviso a `alerts-log`.

Si justo al encender los workers ya ves una `ALARMA`, son mensajes viejos que quedaron en una DLQ de pruebas anteriores. Es la alarma funcionando: vacía esa DLQ como en el punto 4.

## Cómo lo probé

- **Workers (44 pruebas, 100 % de líneas):**
  - `DlqMonitor`: no avisa con las DLQ vacías; avisa una sola vez aunque lleguen más; avisa "Resuelto" y vuelve a avisar si se llena otra vez; los asuntos son ASCII y de menos de 100 caracteres (lo exige SNS); si SNS falla lo reintenta; el bucle avisa una vez por racha de errores y se detiene con Ctrl+C.
  - Los adaptadores, con clientes falsos: `GetQueueAttributes` con `ApproximateNumberOfMessages` (la URL se pide una vez) y `Publish` al tema (el ARN se busca una vez).
  - Las variables nuevas.
- **De punta a punta en el contenedor**, con la API real (MySQL + DynamoDB Local), EventBridge, SQS, SES y SNS emulados (moto, con el script de LocalStack) y los workers:
  - un pedido pagado con un webhook firmado pasó solo PAID → SHIPPED (11 s) → DELIVERED (22 s), con los 3 correos y cada evento procesado una vez por worker;
  - un mensaje basura falló 3 veces, cayó en la DLQ, el vigilante dio la `ALARMA` y el aviso llegó por SNS a `charanatech-alerts-log`; al vaciar la DLQ llegó el `Resuelto`.
- `pnpm check` pasa.

## Cierre de la fase 3

Con esto la tienda ya cobra y el pedido vive solo: pago con Stripe, eventos sin perder ninguno (outbox), workers idempotentes con reintentos y DLQ, correos con SES, envío automático y alertas. Todo corre en tu PC con LocalStack.

La **fase 4** lo lleva a AWS de verdad con Terraform: Lambdas, API Gateway, colas, el relé con DynamoDB Streams, las alarmas de CloudWatch, la clave interna en Secrets Manager y el acceso de producción de SES.

## Para la entrevista

- *"¿Cómo te enteras si algo falla en un sistema con colas?"* → Cada cola tiene una DLQ, y una alarma sobre la DLQ (`> 0` mensajes) avisa por SNS. Avisa al cambiar de estado, no por cada mensaje, para no saturar a nadie.
- *"¿Por qué SNS?"* → Publicas una vez y SNS reparte a todos los suscritos (correo, Slack, otra cola). Para sumar un destino no se toca el código.
- *"Explícame el flujo de una compra."* → Usa el diagrama del README: Stripe → webhook → outbox → EventBridge → SQS → workers (SES y fulfillment) → la API avanza el pedido → nuevo evento. Si algo falla 3 veces: DLQ → alarma → SNS.
