# Paso 32 (fase 4): correos de verdad y alarmas que te escriben

## Qué hacemos

Dos cosas que en tu PC hacía LocalStack y ahora hace AWS:

1. **Correos al cliente con Amazon SES.** En el paso 31 el worker `notifications` solo anotaba los correos en el log (`EMAIL_DELIVERY=log`). Ahora los envía.
2. **Alarmas de las colas de fallidos (DLQ).** Si un mensaje cae en una DLQ, CloudWatch te manda un correo. En tu PC lo hacía `DlqMonitor` (paso 26), que sigue funcionando solo en local.

```
apps/workers/src/shared/ses-email-sender.ts   # el sandbox de SES ya no manda mensajes a la DLQ
infra/terraform/
├─ ses.tf        # NUEVO: el remitente (y destinatarios de prueba) en SES
├─ alerts.tf     # NUEVO: tema SNS, tu suscripción y una alarma por DLQ
└─ workers.tf    # notifications pasa a EMAIL_DELIVERY=ses, con permiso para enviar
```

## Las decisiones, una por una

### 1. El sandbox de SES

Toda cuenta nueva de SES empieza en un **sandbox** (una "zona de pruebas"):

- Solo puedes enviar **desde** direcciones verificadas.
- Solo puedes enviar **a** direcciones verificadas.
- Máximo 200 correos al día.

Verificar una dirección es fácil: Terraform la registra, AWS te manda un correo con un enlace y lo abres. Así que tú (y los correos extra que pongas) recibirás los mensajes de la tienda. Un reclutador que compre con su correo **no** los recibirá, porque su dirección no está verificada.

Salir del sandbox exige pedir **acceso de producción** a AWS, y normalmente piden un dominio propio y explicar cómo manejas rebotes y quejas. Es un extra para más adelante. Lo que acordamos en el plan es mostrar en la página del pedido "el correo que te habríamos enviado". Eso lo hacemos con la tienda en internet (paso 34).

### 2. Un rechazo del sandbox no es un error

Cuando SES rechaza un destinatario sin verificar, responde `MessageRejected`. Si el worker lo tratara como cualquier error, el mensaje se reintentaría 3 veces y caería en la DLQ: la alarma te escribiría por cada compra de un reclutador.

Por eso `SesEmailSender` distingue dos casos:

| Rechazo de SES | Qué significa | Qué hace el worker |
| --- | --- | --- |
| El **destinatario** no está verificado | Sandbox: es lo esperado | Lo anota en el log y da el mensaje por procesado |
| El **remitente** no está verificado | Configuración rota | Lanza el error: reintento, DLQ y alarma |

Reintentar solo tiene sentido si el error puede desaparecer solo (SES lento, un límite momentáneo). Un destinatario sin verificar no se arregla reintentando.

### 3. Permiso para enviar, solo desde la tienda

El rol de `notifications` ahora puede usar `ses:SendEmail`, con una condición: el remitente (`ses:FromAddress`) tiene que ser el de la tienda. Aunque alguien tomara el control del worker, no podría enviar correos haciéndose pasar por otra dirección de tu cuenta.

### 4. Remitente Gmail: puede llegar a Spam

Sin dominio propio, el remitente es tu propio correo (por ejemplo, uno de Gmail). Gmail publica reglas (DMARC) que dicen "los correos de @gmail.com salen de los servidores de Google", y estos salen de los de AWS. Por eso es probable que lleguen a **Spam** o con una advertencia. Con un dominio propio se arregla firmando los correos (DKIM), pero para una demo basta con saberlo.

### 5. Una alarma por DLQ

Hay tres DLQ: `notifications`, `fulfillment` y la del relé del outbox. Cada una tiene una alarma de CloudWatch:

- **Métrica**: `ApproximateNumberOfMessagesVisible`, los mensajes esperando en la cola.
- **Regla**: si en 5 minutos hubo más de 0, pasa a **ALARM** y avisa al tema SNS `charanatech-alerts`.
- Cuando la DLQ vuelve a quedar vacía, pasa a **OK** y te avisa otra vez: sabes que se resolvió.
- `treat_missing_data = notBreaching`: una cola sin actividad no publica datos, y eso significa "todo bien".

SQS publica sus métricas cada 5 minutos, así que el aviso tarda entre 5 y 10 minutos. Para una DLQ alcanza: no es algo que se arregle en segundos.

### 6. Tu correo no entra al repositorio

`alert_email` y `ses_sender_email` van en `terraform.tfvars`, que está en `.gitignore`. El repo es público y no queremos tu correo ahí. Sí quedan en el estado de Terraform, que vive en tu bucket privado de S3.

## Hazlo en tu PC

Todo en **Git Bash**, con **Docker Desktop** abierto.

### 1. Traer `main` con este paso

Cuando hayas fusionado el pull request:

```bash
cd /d/Projects/charanatech
git switch main
git pull
pnpm install
aws login --profile charanatech
```

### 2. Subir la imagen nueva de los workers

El worker de correos cambió (ahora entiende el sandbox), así que hace falta una imagen nueva:

```bash
bash scripts/ecr-push.sh workers
```

Copia la línea `workers_image_tag = "..."` que imprime y **reemplaza** la que ya tienes en `infra/terraform/terraform.tfvars`.

### 3. Tus correos en `terraform.tfvars`

Agrega al final de `infra/terraform/terraform.tfvars` (pueden ser el mismo correo):

```hcl
alert_email      = "tu-correo@gmail.com"
ses_sender_email = "tu-correo@gmail.com"
```

Si quieres probar compras con otra cuenta de correo tuya, agrégala también:

```hcl
ses_verified_recipients = ["otro-correo@gmail.com"]
```

### 4. Plan y apply

```bash
cd infra/terraform
terraform plan
```

Sin `ses_verified_recipients`, el plan debe decir **`Plan: 6 to add, 4 to change, 0 to destroy`**:

- **6 nuevos**: el remitente en SES, el tema SNS, tu suscripción y las 3 alarmas.
- **4 cambios**: las 3 Lambdas de los workers (imagen nueva; `notifications` además pasa a `EMAIL_DELIVERY=ses`) y la política de `notifications` (permiso de SES).

Con cada correo extra en `ses_verified_recipients` hay un recurso nuevo más. Si dice algo distinto, o algo en *destroy*, para y pégamelo.

```bash
terraform apply
```

### 5. Abrir los dos correos de AWS

Revisa tu bandeja (y la carpeta **Spam**). Llegan dos correos:

1. **"Amazon Web Services – Email Address Verification Request in region US East (Ohio)"**: abre el enlace. Verifica el remitente de SES. Si pusiste correos extra, a cada uno le llega uno igual.
2. **"AWS Notification - Subscription Confirmation"**: pulsa **Confirm subscription**. Activa los avisos de las alarmas.

Para comprobar que quedó verificado:

```bash
aws sesv2 list-email-identities --profile charanatech \
  --query 'EmailIdentities[].[IdentityName,VerificationStatus]' --output table
```

Tu correo debe decir **`SUCCESS`**. Si dice `PENDING`, todavía no abriste el enlace.

### 6. Probar un correo de verdad

El mismo evento de prueba del paso 31, ahora con tu correo como cliente y otro `id` (los workers recuerdan los eventos ya procesados). Cambia `tu-correo@gmail.com` por el correo que verificaste:

```bash
cd ~
CORREO="tu-correo@gmail.com"
cat > evento-prueba.json <<EOF
{
  "PK": { "S": "OUTBOX" },
  "SK": { "S": "2026-11-20T12:00:00.000Z#prueba-32" },
  "entity": { "S": "OutboxEvent" },
  "event": { "M": {
    "id": { "S": "prueba-32" },
    "type": { "S": "OrderCancelled" },
    "occurredAt": { "S": "2026-11-20T12:00:00.000Z" },
    "orderId": { "S": "prueba32" },
    "customerId": { "S": "cliente-de-prueba" },
    "customerEmail": { "S": "$CORREO" },
    "status": { "S": "CANCELLED" },
    "total": { "M": { "cents": { "N": "5999" }, "currency": { "S": "USD" } } }
  } }
}
EOF
aws dynamodb put-item --table-name charanatech --item file://evento-prueba.json --profile charanatech
rm evento-prueba.json
```

Esta vez el `EOF` va **sin comillas**, para que Git Bash reemplace `$CORREO` por tu correo.

En menos de un minuto te debe llegar **"Tu pedido fue cancelado · Pedido PRUEBA32"** (mira también en Spam). En el log:

```bash
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/charanatech-notifications --since 10m --profile charanatech
```

Debe aparecer `Correo "Tu pedido fue cancelado · Pedido PRUEBA32" enviado a t***@gmail.com`.

### 7. Probar una alarma

Dejamos un mensaje cualquiera directamente en la DLQ de `notifications`, como si un correo hubiera fallado 3 veces:

```bash
DLQ=$(aws sqs get-queue-url --queue-name charanatech-notifications-dlq \
  --query QueueUrl --output text --profile charanatech)
aws sqs send-message --queue-url "$DLQ" --message-body "prueba de alarma" --profile charanatech
```

En **5 a 10 minutos** te llega **"ALARM: charanatech-notifications-dlq in US East (Ohio)"**. Ahora vacía la DLQ:

```bash
aws sqs purge-queue --queue-url "$DLQ" --profile charanatech
```

En otros 5 a 10 minutos llega **"OK: charanatech-notifications-dlq"**: la alarma se resolvió sola. También puedes verlo en la consola de AWS, en **CloudWatch → Alarms**.

### 8. Apagar RDS si no vas a seguir hoy

Este paso no la usa. Si la encendiste:

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
```

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `No value for required variable "alert_email"` | Faltan los correos en `terraform.tfvars` | Paso 3 |
| El correo de prueba no llega y el log dice `SES en sandbox ... no está verificado` | Usaste un correo que no verificaste | Usa el de `ses_sender_email` o agrégalo a `ses_verified_recipients` |
| El log dice `MessageRejected` con tu propio correo | El remitente sigue en `PENDING` | Paso 5: abre el enlace de verificación |
| El log dice `AccessDenied` con `ses:SendEmail` | El remitente no coincide con el permiso | Pégame el log |
| No llega el aviso de la alarma | La suscripción sigue pendiente | Paso 5: confirma la suscripción de SNS |

## Costo

- **SES**: USD 0.10 por cada 1.000 correos. Con el sandbox (máximo 200 al día), centavos.
- **CloudWatch**: las alarmas cuestan unos USD 0.10 al mes cada una (3 alarmas, ~USD 0.30).
- **SNS**: los primeros 1.000 correos al mes son gratis.

## Para la entrevista

- "Los correos salen con SES. La cuenta está en sandbox, así que un destinatario sin verificar no es un error: el worker lo anota y no lo reintenta. Si el rechazado es el remitente, sí es un error de configuración, y ese va a la DLQ y dispara la alarma."
- "Distingo errores transitorios, que vale la pena reintentar, de errores permanentes, que van al log o directo a la DLQ. Reintentar un error permanente solo llena la DLQ de ruido."
- "El rol del worker puede usar `ses:SendEmail` solo con el remitente de la tienda, gracias a la condición `ses:FromAddress`."
- "Cada DLQ tiene una alarma de CloudWatch sobre `ApproximateNumberOfMessagesVisible` que avisa por SNS al entrar en ALARM y al volver a OK. En local lo hace un monitor propio contra LocalStack."
- "Los correos personales van en `terraform.tfvars`, fuera del repo público."
