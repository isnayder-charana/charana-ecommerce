# Paso 31 (fase 4): los eventos y los workers se mudan a AWS

## Qué hacemos

En la fase 3, el flujo de eventos corría en tu PC con LocalStack. En este paso lo montamos en AWS:

```
API ─▶ DynamoDB (pedido + OUTBOX) ─stream─▶ Lambda outbox-relay
                                                │ PutEvents
                                                ▼
                                  EventBridge (bus "charanatech")
                        regla por worker │                │
                                         ▼                ▼
                     SQS charanatech-notifications   SQS charanatech-fulfillment
                              │ (3 intentos → DLQ)        │ (espera 15 s, 3 intentos → DLQ)
                              ▼                           ▼
                     Lambda notifications        Lambda fulfillment ─▶ API
```

```
apps/workers/
├─ Dockerfile                       # NUEVO: una imagen para las tres Lambdas
└─ src/
   ├─ lambda/server.ts              # NUEVO: punto de entrada (WORKER elige el worker)
   ├─ lambda/handlers.ts            # NUEVO: arma solo el worker pedido
   └─ shared/
      ├─ outbox-relay.ts            # NUEVO: DynamoDB Streams → EventBridge (con tests)
      ├─ eventbridge-publisher.ts   # NUEVO: publica con el mismo formato que la API
      ├─ event-server.ts            # NUEVO: el servidor que habla con Lambda Web Adapter
      └─ ses-email-sender.ts        # EMAIL_DELIVERY=log: anota el correo sin enviarlo
scripts/ecr-push.sh                 # NUEVO: construye y sube una imagen a ECR
infra/terraform/
├─ events.tf                        # NUEVO: bus, reglas, colas, DLQ y sus políticas
├─ workers.tf                       # NUEVO: las tres Lambdas y sus conexiones
└─ modules/worker-lambda/           # NUEVO: rol + logs + Lambda, reutilizable
```

## Las decisiones, una por una

### 1. El relé del outbox: de un temporizador a DynamoDB Streams

Recuerda el patrón *outbox* del paso 22: cuando la API guarda un pedido, en la **misma transacción** guarda sus eventos en la "bandeja de salida" (items `PK = OUTBOX`). Después, alguien tiene que publicarlos en EventBridge.

En tu PC, ese alguien es la propia API, que revisa la bandeja cada segundo con `setInterval`. En Lambda eso no funciona: entre petición y petición la Lambda se **congela**, y el temporizador no avanza. Por eso en el paso 30 la API en AWS lleva `OUTBOX_RELAY_INTERVAL_MS=0`.

Lo reemplazamos con **DynamoDB Streams**, que activamos en el paso 29. Un stream es el "historial de cambios" de la tabla: cada vez que se crea, cambia o borra un item, DynamoDB lo anota, y Lambda puede leerlo. La Lambda `outbox-relay`:

1. Recibe solo los items **OUTBOX recién creados**. Un **filtro** en AWS descarta todo lo demás (pedidos, carritos, borrados) **antes** de invocar la Lambda, así que esos cambios no cuestan nada.
2. Publica cada evento en EventBridge.
3. Borra el item de la bandeja.

Ventaja sobre el temporizador: el evento sale en ~1 segundo y **solo** cuando hay algo que publicar. El temporizador consultaba la tabla aunque estuviera vacía.

**¿Y si falla?** El stream es **ordenado**. Si el evento 3 de un lote falla, la Lambda responde "falló el 3" y Lambda reintenta desde el 3 sin repetir el 1 y el 2. Después de 5 intentos (o 6 horas), manda la referencia a la cola `charanatech-outbox-relay-dlq`. El item **sigue en la tabla** porque nunca se borró, así que el evento no se pierde.

**¿Y si publica pero falla al borrar?** El evento se publica dos veces. No pasa nada: los workers son idempotentes desde el paso 23 (anotan cada evento procesado). Esto es la garantía "**al menos una vez**", la normal en sistemas de eventos.

### 2. Una sola imagen para los tres workers

Las tres Lambdas (`notifications`, `fulfillment` y `outbox-relay`) usan **la misma imagen**. Terraform le pone a cada una la variable `WORKER`, y `src/lambda/handlers.ts` arma solo ese worker:

| WORKER | Lo despierta | Qué hace |
| --- | --- | --- |
| `notifications` | la cola `charanatech-notifications` | El correo al cliente |
| `fulfillment` | la cola `charanatech-fulfillment` | Pide a la API enviar y entregar el pedido |
| `outbox-relay` | el stream de DynamoDB | Publica los eventos de la bandeja |

Una imagen en vez de tres: un solo build, un solo push y una sola etiqueta que dice qué código corre en los tres.

### 3. Node 26 en Lambda, con el mismo adaptador que la API

Lambda tiene "runtimes administrados" (Node, Python…) donde subes un `.zip` y AWS pone Node. El de Node 26 todavía está en **vista previa**, y AWS recomienda no usarlo en producción. Tenemos dos caminos:

- Bajar los workers a Node 24 (el último estable en Lambda), con una versión distinta a la de la API.
- Usar una imagen con Node 26, como la API.

Elegimos la imagen. El **Lambda Web Adapter** del paso 30 también sirve para eventos que no son HTTP: recibe el lote de SQS (o del stream) y lo reenvía como `POST /events` a un servidor mínimo (`shared/event-server.ts`). Lo que ese servidor responde vuelve a Lambda, incluida la lista de mensajes que fallaron.

### 4. Correos en "modo log" hasta el paso 32

Para mandar correos de verdad, SES exige verificar primero el remitente, y eso es el paso 32. Si hoy el worker intentara enviar, SES lo rechazaría, el mensaje se reintentaría 3 veces y terminaría en la DLQ.

Por eso agregamos `EMAIL_DELIVERY`:

- `ses` (por defecto, y lo que usas en tu PC con LocalStack): envía con SES.
- `log`: arma el correo completo pero solo anota el asunto y el destinatario (enmascarado) en el log.

En AWS empieza en `log`. En el paso 32 cambia a `ses`, sin tocar código.

### 5. Colas con DLQ, cifradas, y una política que solo deja entrar a su regla

Cada cola de worker tiene:

- **DLQ**: después de 3 intentos fallidos, el mensaje pasa a `charanatech-<worker>-dlq` y se guarda 14 días. En el paso 32, una alarma de CloudWatch te avisará por correo cuando algo caiga ahí.
- **Visibility timeout de 180 s**: mientras la Lambda procesa un mensaje, SQS lo esconde. AWS recomienda 6 veces el timeout de la Lambda (30 s) para que el mismo mensaje no se reparta dos veces.
- **Cifrado** con llaves de SQS (gratis).
- **Una política** que solo acepta mensajes de EventBridge, y solo desde **la regla de ese worker**. En LocalStack esto no hacía falta; en AWS, sin ella, EventBridge no puede escribir en la cola y los eventos se pierden en silencio.

La cola `fulfillment` mantiene su retraso de 15 segundos (`fulfillment_delay_seconds`): es el "tiempo en el almacén" del envío simulado.

### 6. Permisos mínimos, hasta el nivel de la clave

Cada Lambda tiene su propio rol. Además de limitar **qué** recursos toca, limitamos **qué items** de la tabla:

- `notifications` y `fulfillment` solo pueden leer y escribir items cuya clave empiece por `WORKER_EVENT#<su nombre>#` (sus eventos procesados). Lo hace la condición `dynamodb:LeadingKeys`.
- `outbox-relay` solo puede **borrar** items con `PK = OUTBOX`, y solo puede publicar en **el** bus `charanatech`.
- Solo `fulfillment` lee secretos de SSM (la `INTERNAL_API_KEY` para llamar a la API).

### 7. Un módulo de Terraform

Las tres Lambdas se arman igual: rol, política, grupo de logs (14 días) y función. En vez de copiar eso tres veces, está una vez en `infra/terraform/modules/worker-lambda` y se usa con distintos valores. Es como una función en programación.

## Hazlo en tu PC

Todo en **Git Bash**, con **Docker Desktop** abierto.

### 1. Traer `main` con este paso

Cuando hayas fusionado el pull request:

```bash
cd /d/Projects/charanatech
git switch main
git pull
pnpm install
```

### 2. Iniciar sesión en AWS y encender RDS

```bash
aws login --profile charanatech
aws rds start-db-instance --db-instance-identifier charanatech --profile charanatech
```

Si ya estaba encendida, el segundo comando dice `InvalidDBInstanceState`: está bien, sigue.

### 3. Preparar Terraform (hay un módulo nuevo)

```bash
cd infra/terraform
terraform init -backend-config=backend.hcl
```

Cada vez que aparece un módulo nuevo hay que repetir `init`. Debe terminar con **`Terraform has been successfully initialized!`**.

### 4. Crear el registro de imágenes de los workers

```bash
terraform apply -target=aws_ecr_repository.workers
```

El plan debe decir **`Plan: 1 to add, 0 to change, 0 to destroy`** (con el aviso amarillo de `-target`, que es normal). Responde `yes`.

### 5. Construir y subir la imagen de los workers

```bash
cd /d/Projects/charanatech
bash scripts/ecr-push.sh workers
```

Es el mismo procedimiento del paso 30, ahora en un script que además evita el error de `docker login` en Windows (`The stub received bad data`). Al final imprime algo como:

```
Listo. En infra/terraform/terraform.tfvars:
  workers_image_tag = "abc1234"
```

Agrega esa línea al final de `infra/terraform/terraform.tfvars`.

### 6. Crear el resto

```bash
cd infra/terraform
terraform plan
```

El plan debe decir **`Plan: 28 to add, 0 to change, 0 to destroy`**:

| Qué | Cuántos |
| --- | --- |
| Regla de ciclo de vida del ECR de workers | 1 |
| Bus de EventBridge | 1 |
| Por cada worker de cola (2): cola, DLQ, regla, destino y política de la cola | 10 |
| Por cada Lambda (3): rol, política, grupo de logs y función | 12 |
| Conexiones cola → Lambda (2) y stream → Lambda (1) | 3 |
| DLQ del relé | 1 |

Lo importante: **0 to change, 0 to destroy**. La API, la base y Cognito no se tocan. Si dice otra cosa, para y pégamelo.

```bash
terraform apply
```

### 7. Probar el flujo con un evento de prueba

Todavía no hay tienda en internet (es el paso 34), así que simulamos lo que haría la API: dejamos un evento `OrderCancelled` en la bandeja de salida. Ese tipo de evento solo va al worker de correos, así que no toca ningún pedido real.

```bash
cd ~
cat > evento-prueba.json <<'EOF'
{
  "PK": { "S": "OUTBOX" },
  "SK": { "S": "2026-11-19T12:00:00.000Z#prueba-31" },
  "entity": { "S": "OutboxEvent" },
  "event": { "M": {
    "id": { "S": "prueba-31" },
    "type": { "S": "OrderCancelled" },
    "occurredAt": { "S": "2026-11-19T12:00:00.000Z" },
    "orderId": { "S": "prueba31" },
    "customerId": { "S": "cliente-de-prueba" },
    "customerEmail": { "S": "prueba@example.com" },
    "status": { "S": "CANCELLED" },
    "total": { "M": { "cents": { "N": "5999" }, "currency": { "S": "USD" } } }
  } }
}
EOF
aws dynamodb put-item --table-name charanatech --item file://evento-prueba.json --profile charanatech
rm evento-prueba.json
```

Espera unos 10 segundos (la primera vez, las Lambdas arrancan en frío) y mira los logs del relé:

```bash
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/charanatech-outbox-relay --since 10m --profile charanatech
```

Debe aparecer:

```
[outbox-relay] OrderCancelled del pedido prueba31 publicado (evento prueba-31)
```

Y los del worker de correos:

```bash
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/charanatech-notifications --since 10m --profile charanatech
```

Debe aparecer, entre otras líneas:

```
[correo] [sin enviar: EMAIL_DELIVERY=log] "Tu pedido fue cancelado · Pedido PRUEBA31" para p***@example.com
[notifications] OrderCancelled del pedido prueba31 (evento prueba-31): procesado
```

Comprueba que el relé **borró** el item de la bandeja. Este comando no debe imprimir nada:

```bash
aws dynamodb get-item --table-name charanatech --profile charanatech \
  --key '{"PK":{"S":"OUTBOX"},"SK":{"S":"2026-11-19T12:00:00.000Z#prueba-31"}}'
```

El camino de `fulfillment` (pagado → enviado → entregado) lo probamos en el paso 34 con una compra real, porque necesita un pedido que exista.

### 8. Ver las colas de fallidos

```bash
terraform -chdir=/d/Projects/charanatech/infra/terraform output dead_letter_queues
```

En la consola de AWS, **SQS** (región Ohio), las tres DLQ deben mostrar **0** mensajes disponibles.

### 9. Apagar RDS si no vas a seguir hoy

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
```

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `terraform plan` dice `Module not installed` | Faltó `init` | Paso 3 |
| `Falta workers_image_tag en terraform.tfvars` | No agregaste la etiqueta | Paso 5 |
| El script dice `Hay cambios sin commit` | Tienes archivos modificados | `git status`; guarda o descarta los cambios |
| El log del relé no muestra nada | El evento se creó antes de que existiera la conexión con el stream | Crea otro evento de prueba con otro `id` y otra `SK` |
| El log del relé dice `No se pudo publicar` | El evento no cumple el contrato o EventBridge lo rechazó | Pégame el log |
| No hay log de `notifications` | La regla o la política de la cola | Mira la DLQ y pégame el log del relé |

## Costo

- **EventBridge**: USD 1 por millón de eventos.
- **SQS**: el primer millón de peticiones al mes es gratis. Ojo: Lambda consulta las colas aunque estén vacías (unas pocas peticiones por minuto). Sigue dentro de lo gratuito.
- **Lambda y DynamoDB Streams**: leer el stream desde Lambda no cuesta; las invocaciones caben en lo gratuito.
- **ECR**: otra imagen de ~150 MB, unos centavos al mes.

## Para la entrevista

- "El outbox en AWS no usa un temporizador: DynamoDB Streams dispara una Lambda con un filtro que solo deja pasar los INSERT de la bandeja. Publica en EventBridge y borra el item. Garantía al menos una vez, con consumidores idempotentes."
- "Si el relé falla, devuelve el primer registro fallido y Lambda reintenta desde ahí, respetando el orden del stream. Tras 5 intentos va a una DLQ, y el evento sigue en la tabla porque solo se borra después de publicarse."
- "EventBridge enruta por tipo de evento a una cola SQS por consumidor, cada una con su DLQ, cifrado y una política que solo acepta mensajes de su regla."
- "Los permisos llegan hasta la clave: con `dynamodb:LeadingKeys`, cada worker solo puede tocar sus propios items de idempotencia."
- "Las tres Lambdas comparten una imagen de contenedor con Node 26 y el Lambda Web Adapter en modo eventos, porque el runtime administrado de Node 26 todavía está en vista previa."
- "Los correos tienen un interruptor `EMAIL_DELIVERY` (ses o log): pude desplegar el worker antes de verificar el dominio en SES sin que los mensajes terminaran en la DLQ."
