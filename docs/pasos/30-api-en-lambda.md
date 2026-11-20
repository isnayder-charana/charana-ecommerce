# Paso 30 (fase 4): la API sale a internet en Lambda

## Qué hacemos

Hasta ahora la API de NestJS corría en tu PC (`pnpm dev`). En este paso la subimos a AWS, conectada a la MySQL de RDS y a la tabla de DynamoDB del paso 29:

```
navegador / Stripe ──HTTPS──▶ API Gateway (HTTP API) ──▶ Lambda (imagen Docker)
                                                           │ Lambda Web Adapter
                                                           ▼
                                                NestJS escuchando en :8080
                                                  │            │          │
                                          SSM (secretos)   RDS MySQL   DynamoDB
```

```
apps/api/
├─ Dockerfile                      # NUEVO: la imagen que corre en Lambda
└─ src/
   ├─ main.ts                      # lee los secretos de SSM antes de arrancar
   ├─ config/load-ssm-env.ts       # NUEVO: SSM → variables de entorno (con tests)
   └─ shared/infrastructure/database/prisma.ts   # MySQL con TLS (con tests)
.dockerignore                      # NUEVO: qué NO entra a la imagen
infra/terraform/
├─ ecr.tf                          # NUEVO: el registro de imágenes
├─ api.tf                          # NUEVO: rol IAM, logs, Lambda y API Gateway
├─ database.tf                     # regla nueva: la Lambda llega a MySQL
└─ ssm.tf                          # DATABASE_URL con TLS + secreto del webhook
```

## Las decisiones, una por una

### 1. La misma API, sin reescribirla: Lambda Web Adapter

Lambda no habla HTTP: recibe un "evento" JSON y devuelve otro. La forma clásica es envolver NestJS con una librería que traduce esos eventos. Nosotros usamos el **Lambda Web Adapter** de AWS: un binario que se copia dentro de la imagen como "extensión" de Lambda. Arranca junto a la Lambda, espera a que NestJS responda en `/api/health` y le reenvía cada evento como una petición HTTP normal a `localhost:8080`.

Resultado: `main.ts` sigue haciendo `app.listen(port)`, igual que en tu PC. El mismo código corre en `pnpm dev`, en Docker y en Lambda.

### 2. Imagen Docker y no un .zip

Lambda acepta código en `.zip` (máximo 250 MB descomprimido) o una **imagen de contenedor** (hasta 10 GB). Con Prisma, el SDK de AWS y NestJS, el `.zip` queda justo. La imagen además es la misma que puedes correr en tu PC con `docker run`, y el Dockerfile documenta exactamente qué lleva.

El Dockerfile tiene dos etapas:

1. **build**: instala dependencias, compila TypeScript y genera el cliente de Prisma. Luego `pnpm deploy --prod` copia solo lo que la API necesita en producción.
2. **final**: Node limpio + el resultado de la etapa 1 + el Lambda Web Adapter + el certificado de RDS. Corre como el usuario `node`, no como root.

Se construye con dos opciones que Lambda exige:

- `--platform linux/amd64`: la Lambda corre en procesadores x86. Si tu PC fuera ARM (un Mac M1, por ejemplo), sin esto la imagen no arrancaría.
- `--provenance=false`: Docker Desktop agrega por defecto un "certificado de origen" a la imagen, y Lambda rechaza imágenes con ese formato.

### 3. Los secretos llegan de SSM al arrancar, nunca escritos en la Lambda

Lambda permite poner variables de entorno, pero cualquiera con acceso de lectura a la consola las ve en texto plano. Por eso la Lambda solo recibe **dónde** están los secretos (`SSM_PARAMETERS_PATH=/charanatech/prod`) y `main.ts` hace esto antes de arrancar NestJS:

1. Pide a SSM todos los parámetros bajo `/charanatech/prod`, ya descifrados.
2. Convierte cada nombre en una variable: `database-url` → `DATABASE_URL`, `stripe-webhook-secret` → `STRIPE_WEBHOOK_SECRET`.
3. Si la variable ya existe (por ejemplo, en tu `.env` local), no la pisa.

Recién después importa `AppModule`. El orden importa: la validación de variables de entorno corre al importar el módulo, y sin los secretos fallaría con "obligatorio en producción".

Esto ocurre una sola vez por cada Lambda que arranca (el "arranque en frío"), no en cada petición.

### 4. MySQL con TLS verificado

En el paso 29 activamos `require_secure_transport` en RDS: MySQL rechaza conexiones sin cifrar. Ahora la API también **verifica** que del otro lado está de verdad tu RDS:

- La imagen incluye el certificado de la autoridad de AWS para `us-east-2` (`/app/certs/rds-ca.pem`).
- La `DATABASE_URL` de SSM termina en `?sslcert=/app/certs/rds-ca.pem&sslaccept=strict`.
- `prisma.ts` lee esos dos valores y le pasa el certificado al driver de MySQL. Con `strict`, si el servidor presenta otro certificado o el nombre no coincide, la API se niega a conectar.

Lo probé en el contenedor con un MySQL 8.4 con TLS: con el certificado correcto conecta (TLS 1.3), y con otro certificado o con otro nombre de servidor falla, que es lo que queremos.

### 5. El puerto 3306 queda abierto a internet (y por qué está bien en este proyecto)

En el paso 29, MySQL solo aceptaba tu IP. La Lambda no tiene IP fija: cambia en cada arranque. Las opciones eran:

| Opción | Costo extra | Qué protege |
| --- | --- | --- |
| Lambda en una subred privada + NAT Gateway | ~USD 32/mes | La base no se ve desde internet |
| RDS Proxy | ~USD 22/mes | Igual, más un "pool" de conexiones |
| **Puerto abierto + TLS obligatorio + contraseña de 40 caracteres aleatorios** | 0 | Nadie lee el tráfico y la contraseña no se puede adivinar |

Elegimos la tercera porque es una demo con créditos limitados. En una empresa iría la primera, y conviene decirlo así en la entrevista: conoces la solución "de libro" y elegiste otra por una razón concreta.

### 6. El relé del outbox se apaga dentro de la API

En tu PC, la API revisa el outbox cada segundo y publica los eventos en EventBridge. En Lambda eso no sirve: entre una petición y otra la Lambda se **congela**, y el temporizador no avanza. Por eso la Lambda lleva `OUTBOX_RELAY_INTERVAL_MS=0`.

Consecuencia: en este paso un pago en AWS deja el pedido en PAID, pero los eventos (`OrderPaid`, etc.) se quedan esperando en el outbox. En el **paso 31** los publica una Lambda que escucha el *stream* de DynamoDB: cada vez que se guarda un evento, DynamoDB avisa y esa Lambda lo publica. No se pierde nada: quedan guardados hasta entonces.

### 7. API Gateway con freno de mano

Usamos **HTTP API**, la versión simple de API Gateway (cuesta ~70 % menos que "REST API"). Tiene una sola ruta, `$default`, que le pasa todo a la Lambda: las rutas las sigue decidiendo NestJS, igual que el CORS.

La URL es pública, así que la limitamos a **20 peticiones por segundo** (con ráfagas de hasta 40). Si alguien la bombardea, API Gateway responde `429 Too Many Requests` sin despertar la Lambda ni gastar tus créditos.

### 8. Permisos mínimos

La Lambda tiene su propio rol de IAM que solo puede:

- escribir en **su** grupo de logs (que guarda 14 días, no para siempre);
- leer los parámetros de `/charanatech/prod`;
- leer y escribir en **la** tabla `charanatech` (sin `Scan` ni borrar la tabla).

No puede tocar nada más de tu cuenta.

## Hazlo en tu PC

Todo en **Git Bash**. Ten **Docker Desktop** abierto.

### 1. Traer la rama de este paso

```bash
cd /d/Projects/charanatech
git fetch origin
git switch feat/api-on-lambda
pnpm install
```

`pnpm install` trae `@aws-sdk/client-ssm`, la librería nueva que lee SSM.

### 2. Iniciar sesión en AWS y encender RDS

```bash
aws login --profile charanatech
aws rds describe-db-instances --db-instance-identifier charanatech \
  --query 'DBInstances[0].DBInstanceStatus' --output text --profile charanatech
```

Si dice `stopped`, enciéndela y espera (unos 5 minutos):

```bash
aws rds start-db-instance --db-instance-identifier charanatech --profile charanatech
aws rds wait db-instance-available --db-instance-identifier charanatech --profile charanatech
```

### 3. Primera mitad: el registro de imágenes y la URL de la API

Hay un orden obligado:

- La Lambda necesita la imagen **ya subida** a ECR.
- La API exige `STRIPE_WEBHOOK_SECRET` en producción, y Stripe solo te lo da cuando creas el webhook con la **URL** de la API.

Así que primero creamos solo esas dos piezas:

```bash
cd infra/terraform
terraform apply -target=aws_ecr_repository.api -target=aws_apigatewayv2_api.api
```

El plan debe decir **`Plan: 2 to add, 0 to change, 0 to destroy`**. Terraform muestra un aviso amarillo sobre `-target` ("Resource targeting is in effect"): es normal, `-target` es para casos como este. Responde `yes`.

```bash
terraform output -raw stripe_webhook_url; echo
```

Copia esa URL (termina en `/api/payments/webhook`).

### 4. Crear el webhook en Stripe

En el Dashboard de Stripe, con **modo de prueba** activado (Test mode):

1. Ve a **Developers → Webhooks** (en el Dashboard nuevo puede llamarse **Workbench → Event destinations**) y elige **Add destination** / **Add endpoint**.
2. Selecciona estos 3 eventos:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
3. Tipo de destino: **Webhook endpoint**. En la URL pega la del paso anterior.
4. Crea el destino y, en su página, pulsa **Reveal** en *Signing secret*. Empieza con `whsec_`.

Es un secreto **distinto** del que usas en tu PC con `stripe listen`: cada endpoint tiene el suyo.

Abre `infra/terraform/terraform.tfvars` y agrega al final:

```hcl
stripe_webhook_secret = "whsec_..."
```

### 5. Construir y subir la imagen

```bash
cd /d/Projects/charanatech
bash scripts/ecr-push.sh api
```

El script (`scripts/ecr-push.sh`, agregado en el paso 31) hace esto:

1. Comprueba que no tengas cambios sin commit: la etiqueta de la imagen es el commit actual (7 letras), así cada imagen queda ligada al código exacto con el que se construyó.
2. Si esa etiqueta ya está en ECR, no hace nada: el registro es *inmutable* y no acepta otra imagen con la misma etiqueta.
3. Construye la imagen con `--platform linux/amd64 --provenance=false`.
4. Abre una sesión de Docker en ECR con una contraseña temporal (12 horas) que la CLI pide con tu sesión de `aws login`. Sin llaves guardadas.
5. Sube la imagen e imprime la línea para `terraform.tfvars`.

La primera vez el build tarda unos minutos. El `push` sube ~150 MB.

> **Por qué un script y no `docker login`.** En Windows, `docker login` intenta guardar la contraseña de ECR en el Administrador de credenciales, y este la rechaza por larga: `error storing credentials ... The stub received bad data`. Te pasó en este paso. El script escribe la sesión en una configuración de Docker aparte (`DOCKER_CONFIG`), solo para ese `push`, y la borra al terminar.

Agrega la línea que imprimió al final de `terraform.tfvars`:

```hcl
api_image_tag = "abc1234"
```

### 6. Segunda mitad: la Lambda y el resto

```bash
cd infra/terraform
terraform plan
```

El plan debe decir **`Plan: 11 to add, 4 to change, 0 to destroy`**:

- **11 nuevos**: la regla de ciclo de vida de ECR, el rol de IAM y su política, el grupo de logs, la Lambda, la integración, la ruta y el *stage* de API Gateway, el permiso para invocar la Lambda, la regla de MySQL para la Lambda y el parámetro `stripe-webhook-secret`.
- **4 cambios**: los tres parámetros de SSM del paso 29 y la base de datos. Pasa porque `secrets_version` subió a 2: la `DATABASE_URL` cambió (ahora lleva el certificado) y Terraform vuelve a enviar los secretos. A RDS le reenvía **la misma** contraseña de tu `terraform.tfvars`, así que nada se rompe.

Lo importante: **0 to destroy**. Si dice otra cosa, para y pégamelo.

```bash
terraform apply
```

### 7. Crear las tablas y el catálogo en RDS

La base de RDS está vacía. Las migraciones de Prisma y la carga de productos las corres **desde tu PC**, con la misma `DATABASE_URL` que usa la Lambda, cambiando solo la ruta del certificado por la de tu PC (lo descargaste en el paso 29, en `~/rds-ca.pem`):

```bash
cd /d/Projects/charanatech/apps/api

export DATABASE_URL="$(MSYS_NO_PATHCONV=1 aws ssm get-parameter \
  --name /charanatech/prod/database-url --with-decryption \
  --query Parameter.Value --output text --profile charanatech \
  | sed "s#/app/certs/rds-ca.pem#$(cygpath -m ~/rds-ca.pem)#")"

pnpm db:deploy
pnpm db:seed
unset DATABASE_URL
```

- `cygpath -m ~/rds-ca.pem` convierte la ruta de Git Bash en una que Node y Prisma entienden en Windows (`C:/Users/...`).
- Así no escribes la contraseña en ningún lado: viaja de SSM a la variable, y `unset` la borra al terminar.
- Tu `apps/api/.env` no estorba: Prisma y Node no pisan una variable que ya existe.

`db:deploy` debe terminar con **`All migrations have been successfully applied`**, y `db:seed` con el número de productos cargados.

### 8. Probar la API en internet

```bash
cd /d/Projects/charanatech/infra/terraform
API=$(terraform output -raw api_url)
echo "$API"
curl -s "$API/api/health"; echo
curl -s "$API/api/products" | head -c 400; echo
```

- `/api/health` debe responder `{"status":"ok"}`. La **primera** petición tarda 2 a 5 segundos: es el arranque en frío (Lambda crea el contenedor, lee SSM y arranca NestJS). Las siguientes tardan milisegundos.
- `/api/products` debe devolver los productos de la semilla, ahora leídos de RDS.
- Abre `$API/api/docs` en el navegador: es el mismo Swagger de tu PC, ahora público.

Mira los logs de la Lambda:

```bash
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/charanatech-api --since 15m --profile charanatech
```

Debe aparecer `SSM: 4 variables cargadas desde /charanatech/prod`.

El pago completo (tienda → Stripe → webhook → pedido PAID) lo probamos en el paso 34, cuando la tienda esté en Vercel apuntando a esta API.

### 9. Apagar RDS si no vas a seguir hoy

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
```

Con RDS apagada, `/api/health` sigue respondiendo (no consulta la base), pero `/api/products` falla. Enciéndela antes de seguir con el paso 31.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `docker push` dice `no basic auth credentials` | No hay sesión de Docker en ECR | Usa `bash scripts/ecr-push.sh api` (sección 5), no `docker login` |
| El `apply` de la Lambda dice `image manifest ... not supported` | La imagen se construyó sin `--provenance=false` | Haz un commit nuevo y vuelve a correr el script (la etiqueta cambia) |
| `/api/health` responde `{"message":"Internal Server Error"}` o `Service Unavailable` | NestJS no arrancó | Mira los logs (paso 8). Si dice `Variables de entorno inválidas`, falta un parámetro en SSM |
| `/api/products` tarda 30 s y falla | RDS está apagada | Paso 2 |
| `db:deploy` dice `P1011` o algo de certificado | Falta `~/rds-ca.pem` | Descárgalo como en el paso 29, sección 5 |

## Costo

- **Lambda**: el primer millón de peticiones al mes y 400.000 GB-segundo son gratis. Una demo no pasa de eso.
- **API Gateway (HTTP API)**: USD 1 por millón de peticiones.
- **ECR**: USD 0.10 por GB al mes. Con hasta 10 imágenes de ~150 MB, unos USD 0.15.
- **CloudWatch Logs**: centavos, porque se borran a los 14 días.

Lo caro sigue siendo RDS (~USD 18/mes encendida): apágala cuando no la uses.

## Para la entrevista

- "La API de NestJS corre en Lambda como imagen de contenedor con el Lambda Web Adapter: el mismo código y la misma imagen corren en local, en Docker y en Lambda, sin un handler especial."
- "Los secretos están en SSM Parameter Store como SecureString. La Lambda solo recibe la ruta; al arrancar los lee y los convierte en variables de entorno antes de que NestJS valide la configuración. Ningún secreto aparece en la consola de Lambda ni en el estado de Terraform."
- "La conexión a RDS va con TLS verificado: la imagen lleva la CA de RDS y el driver rechaza cualquier certificado que no sea el de mi instancia."
- "Para no pagar un NAT Gateway, RDS es pública con TLS obligatorio y una contraseña aleatoria de 40 caracteres. En producción real pondría la Lambda en una subred privada o usaría RDS Proxy."
- "Las imágenes en ECR se etiquetan con el commit de git y son inmutables, así sé exactamente qué código está desplegado."
- "API Gateway tiene un límite de 20 peticiones por segundo como freno de costos, y la Lambda tiene un rol IAM con mínimo privilegio sobre su tabla, sus parámetros y sus logs."
- "El relé del outbox no puede correr con un temporizador dentro de Lambda, porque la Lambda se congela entre peticiones. Lo reemplazo con DynamoDB Streams."
