# Paso 37 (fase 4): prueba de punta a punta en producción

## Qué hacemos

La tienda ya está entera en internet. En este último paso de la fase 4 la miramos como la verá un reclutador:

1. Un **script de prueba de humo** (`scripts/smoke-prod.sh`) que en 10 segundos dice si la tienda, la API, la base de datos y las fotos responden.
2. Un **recorrido completo** en producción, a mano, como un cliente: entrar, comprar, pagar y ver el pedido llegar a **Entregado**.
3. Un **README pensado para reclutadores**: la tienda en vivo arriba, "Pruébalo tú" con la tarjeta de prueba, qué tecnologías hay detrás, la arquitectura en AWS y los costos.

```
scripts/smoke-prod.sh                    # NUEVO: prueba de humo contra producción
README.md                                # enlace a la tienda, "Pruébalo tú", arquitectura en AWS y costos
docs/pasos/37-prueba-en-produccion.md    # esta guía
```

## Las decisiones, una por una

### 1. El README empieza por la tienda, no por el código

Un reclutador dedica menos de un minuto a un repositorio. Por eso lo primero es el **enlace a la tienda** y los **5 pasos para comprar** con la tarjeta `4242 4242 4242 4242`. Después viene una tabla de tecnologías, que es lo que buscan al compararlo con la oferta de trabajo. La arquitectura, los costos y la bitácora quedan abajo, para quien quiera profundizar (por ejemplo, en una entrevista técnica).

### 2. Una prueba de humo que no toca nada

Una **prueba de humo** (*smoke test*) no prueba cada detalle: revisa que lo básico encienda. El script solo lee:

| Revisa | Cómo | Si falla, lo más probable es… |
| --- | --- | --- |
| La API responde | `GET /api/health` → 200 | La Lambda no arranca |
| El catálogo sale de MySQL | `GET /api/products` → 200 y al menos 1 producto | RDS está apagada |
| Las fotos llegan | `HEAD` a la primera `imageUrl` → 200 | CloudFront o el seed del paso 33 |
| Los pedidos piden sesión | `GET /api/orders` sin token → 401 | Se rompió el guard de autenticación |
| CORS acepta la tienda | `OPTIONS` con `Origin` de la tienda | `store_urls` en `terraform.tfvars` |
| La tienda carga | La portada y `/privacidad` → 200 | Vercel |

No compra nada, así que puedes correrlo las veces que quieras, sin llenar la base de pedidos de prueba. La compra la hacemos a mano (punto 2 de "Hazlo en tu PC") porque necesita iniciar sesión y pasar por la página de Stripe.

### 3. ¿Por qué no lo corre el despliegue?

El **Deploy** del paso 36 solo comprueba `/api/health`, que no toca la base. Si también revisara el catálogo, un despliegue fallaría cada vez que RDS esté apagada, aunque el código esté bien. La prueba de humo es para ti, cuando quieras saber si la demo está lista. Una prueba automática del recorrido completo en el navegador llega en la fase 5, con **Playwright**.

### 4. La base de datos es lo único caro

Casi todo cobra por uso (Lambda, API Gateway, SQS, DynamoDB…) y una demo casi no lo usa. **RDS** cobra por hora, aunque nadie compre: unos USD 18 al mes. Si está apagada, la tienda abre pero sin productos. Mientras envías tu CV, conviene dejarla encendida: con los créditos alcanza para unos 6 meses.

## Hazlo en tu PC

Todo en **Git Bash**.

### 1. Traer `main` con este paso

Cuando hayas fusionado el pull request:

```bash
cd /d/Projects/charanatech
git switch main
git pull
aws login --profile charanatech
```

El **Deploy** te pedirá aprobación como siempre. Este paso no cambia código de la API ni de los workers, pero aprobarlo no hace daño.

### 2. Encender RDS, si está apagada

```bash
aws rds describe-db-instances --db-instance-identifier charanatech \
  --query 'DBInstances[0].DBInstanceStatus' --output text --profile charanatech
```

Si dice `stopped`:

```bash
aws rds start-db-instance --db-instance-identifier charanatech --profile charanatech
aws rds wait db-instance-available --db-instance-identifier charanatech --profile charanatech
```

El `wait` tarda unos 5 minutos y vuelve sin imprimir nada cuando está lista.

### 3. La prueba de humo

```bash
API=$(terraform -chdir=infra/terraform output -raw api_url)
scripts/smoke-prod.sh "$API" https://charana-ecommerce.vercel.app
```

Debe terminar con **`7 bien, 0 con fallas.`** Si algo falla, el script te dice qué revisar.

### 4. El recorrido completo, como un reclutador

Abre una **ventana de incógnito** (así no usas tu sesión de siempre) y entra a <https://charana-ecommerce.vercel.app>.

| # | Haz esto | Debes ver |
| --- | --- | --- |
| 1 | Mira la portada y el catálogo | Los 6 productos, con foto y precio |
| 2 | **Iniciar sesión → Continuar con Google** | Vuelves a la tienda con tu nombre arriba |
| 3 | Agrega 2 productos al carrito → **Continuar compra** | El pedido en **Pendiente de pago** |
| 4 | **Pagar con Stripe** con `4000 0000 0000 0002` | Stripe dice que la tarjeta fue rechazada. Vuelve a la tienda sin pagar: el pedido sigue en **Pendiente de pago** |
| 5 | **Pagar con Stripe** con `4242 4242 4242 4242`, fecha `12/34`, CVC `123` | Vuelves al pedido; en segundos, **Pagado** |
| 6 | Quédate en la página | ~15 s después **Enviado**, ~15 s más **Entregado** |
| 7 | Baja a **Correos de este pedido** | Un correo por cada estado: pagado, enviado y entregado |
| 8 | **Mis pedidos** | El pedido, en **Entregado** |
| 9 | Crea otro pedido y pulsa **Cancelar pedido** antes de pagar | Pasa a **Cancelado** y el stock vuelve |
| 10 | Pie de página → **Privacidad** | La página de privacidad |

Si quieres probar el registro con correo, en otra ventana de incógnito usa **Crear cuenta** con otro correo tuyo: Cognito te manda el código.

### 5. Revisar que nada quedó en rojo

Ningún mensaje debió terminar en una DLQ, y ninguna alarma debe estar sonando:

```bash
for q in notifications fulfillment outbox-relay; do
  url=$(aws sqs get-queue-url --queue-name "charanatech-$q-dlq" --query QueueUrl --output text --profile charanatech)
  echo "$q-dlq: $(aws sqs get-queue-attributes --queue-url "$url" \
    --attribute-names ApproximateNumberOfMessages --query Attributes.ApproximateNumberOfMessages \
    --output text --profile charanatech)"
done
aws cloudwatch describe-alarms --state-value ALARM --query 'MetricAlarms[].AlarmName' --profile charanatech
```

Las tres colas deben decir `0`, y la lista de alarmas, `[]`.

### 6. Revisar los costos

En la consola de AWS:

1. **Billing and Cost Management → Credits**: cuántos créditos te quedan.
2. **Billing and Cost Management → Bills**: el gasto del mes, por servicio. **RDS** (y "VPC", por la IPv4 pública) debe ser casi todo; lo demás, centavos.

Compáralo con la tabla **Costos** del README.

### 7. El README en GitHub

Abre el repo en GitHub. Arriba debe verse el enlace a la tienda, "Pruébalo tú" y los dos diagramas dibujados (GitHub dibuja los bloques `mermaid` solo). Ese enlace es el que pones en tu CV y en LinkedIn.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `FALLA el catálogo no responde: HTTP 500` | RDS apagada (o encendiéndose) | Punto 2 de esta guía, y vuelve a correr el script |
| `FALLA CORS no acepta …` | La URL de la tienda no está en `store_urls` | Corrige `terraform.tfvars` y haz `terraform apply` (paso 34) |
| `FALLA la portada respondió HTTP 000` | Sin conexión, o URL de la tienda mal escrita | Ábrela en el navegador; revisa el dominio en Vercel → **Domains** |
| El pedido se queda en **Pagado** | El worker `fulfillment` falla | `aws logs tail /aws/lambda/charanatech-fulfillment --since 15m --profile charanatech` y revisa su DLQ |
| Nunca pasa a **Pagado** | El webhook de Stripe no llega | Stripe Dashboard → **Webhooks** → mira los intentos y el código de respuesta |
| No aparece **Correos de este pedido** | El worker `notifications` falla | `aws logs tail /aws/lambda/charanatech-notifications --since 15m --profile charanatech` |

## Costo

Este paso no crea nada en AWS. La compra de prueba agrega unos pocos items en DynamoDB: centavos.

## Para la entrevista

- "La tienda está en producción y cualquiera puede comprar con la tarjeta de prueba de Stripe: ve el pedido pasar de Pagado a Enviado y Entregado en medio minuto, movido por eventos."
- "Tengo una prueba de humo en bash que en 10 segundos revisa la API, el catálogo en RDS, las fotos en CloudFront, que los pedidos exijan token, el CORS y la tienda. Solo lee, así que se puede correr contra producción cuando quiera."
- "El health check del despliegue no toca la base a propósito: si RDS está apagada por costos, el código nuevo igual se puede desplegar. La revisión profunda es la prueba de humo, aparte."
- "La demo cuesta unos USD 19 al mes, y 18 son de RDS. Todo lo demás es serverless y cobra por uso. Si fuera un proyecto con tráfico real, revisaría Aurora Serverless o apagar RDS fuera de horario."
- "Probé el camino triste en producción también: tarjeta rechazada, pedido cancelado que devuelve el stock, y que ninguna DLQ ni alarma quede en rojo."
