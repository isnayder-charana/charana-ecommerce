# Paso 34 (fase 4): la tienda sale a internet en Vercel

## Qué hacemos

La API, los workers y las fotos ya viven en AWS. Falta la tienda: en este paso la publicamos en **Vercel** y la conectamos con todo lo demás. Al terminar, cualquiera puede abrir la tienda, entrar con Google, pagar con una tarjeta de prueba de Stripe y ver cómo su pedido pasa a Pagado, Enviado y Entregado.

```
navegador ──▶ Vercel (Next.js)  charanatech.vercel.app
   │
   ├──▶ API Gateway + Lambda (API)  ──▶ RDS, DynamoDB
   ├──▶ Cognito (entrar con correo o Google)
   ├──▶ Stripe (página de pago)
   └──▶ CloudFront (fotos)
```

También agregamos dos cosas que la tienda necesita para estar en internet:

1. **"Correos de este pedido"** en la página del pedido. SES está en sandbox (paso 32): un reclutador que compra con su correo no recibe nada. Ahora la página le muestra el correo que le habríamos enviado.
2. **Una página de privacidad** (`/privacidad`). Google la pide para publicar el inicio de sesión con Google.

```
apps/workers/src/shared/order-email-log.ts           # NUEVO: puerto "guardar copia del correo"
apps/workers/src/shared/dynamodb-order-email-log.ts  # NUEVO: la copia, en DynamoDB
apps/workers/src/notifications/notify-customer.ts    # guarda la copia después de enviar
apps/api/src/modules/orders/application/list-order-emails.use-case.ts  # NUEVO
apps/api/.../persistence/dynamodb-order-emails.reader.ts               # NUEVO
apps/api/.../http/orders.controller.ts               # GET /orders/:id/emails
apps/web/src/features/orders/order-emails.tsx        # NUEVO: la sección en la página del pedido
apps/web/src/app/privacidad/page.tsx                 # NUEVO
infra/terraform/workers.tf                           # notifications puede escribir ORDER_EMAIL#...
infra/terraform/outputs.tf                           # vercel_environment: las variables listas para pegar
```

## Las decisiones, una por una

### 1. El correo que te habríamos enviado

El worker `notifications` ya armaba el correo de cada cambio del pedido. Ahora, además de enviarlo, **guarda una copia** en DynamoDB:

```
PK = ORDER_EMAIL#<pedido>   SK = <fecha del evento>#<id del evento>
asunto, texto, delivered (true si SES lo entregó), expiresAt (se borra a los 90 días)
```

- La copia se guarda **siempre**, se haya enviado o no. `delivered` dice cuál de los dos casos fue, y la tienda muestra "Enviado a tu correo" o "No enviado (demo)".
- La clave incluye el id del evento. Si el mismo evento llega dos veces, la copia se sobrescribe, no se duplica.
- La API lee los correos de un pedido con **una sola consulta** por `PK`, y DynamoDB ya los devuelve ordenados por `SK`, es decir, por fecha.
- `GET /api/orders/:id/emails` revisa primero que el pedido sea tuyo, igual que `GET /api/orders/:id`. Si es de otra persona, responde 404.
- El permiso del worker es solo `PutItem` sobre claves que empiezan con `ORDER_EMAIL#`. No puede leerlas ni tocar pedidos.

La página del pedido pregunta por los correos solo cuando hay alguno que esperar (el pedido ya se pagó o se canceló). Como el worker escribe la copia unos segundos después del cambio de estado, la página vuelve a preguntar cada 5 segundos hasta que aparece, con un máximo de un minuto.

### 2. Vercel compila la tienda desde el monorepo

Vercel se conecta a tu repositorio de GitHub. En cada push a `main` compila y publica la tienda. En cada pull request publica una versión de prueba (*preview*) con su propia URL.

- **Root Directory = `apps/web`**: Vercel sabe que la tienda está ahí. Igual puede ver la raíz del repo, donde están `pnpm-lock.yaml` y la configuración del workspace.
- **`ENABLE_EXPERIMENTAL_COREPACK=1`**: así Vercel usa la versión exacta de pnpm que pide `packageManager` en el `package.json` de la raíz, la misma que usas en tu PC.
- **Node.js**: Vercel lee `engines.node` del `package.json` (Node 26).

### 3. Las variables `NEXT_PUBLIC_*` se fijan al compilar

Next.js copia las variables `NEXT_PUBLIC_*` dentro del código que descarga el navegador **cuando compila**. Por eso:

- Solo van ahí valores públicos: la URL de la API y los ids de Cognito. Nunca un secreto.
- Si cambias una, tienes que volver a publicar (*Redeploy*) para que la tienda la use.

Para no copiarlas una por una, Terraform las arma: `terraform output -raw vercel_environment` (disponible después del primer `apply` de este paso).

### 4. La URL de la tienda va en tres lugares, y los tres salen de `store_urls`

| Dónde | Para qué |
| --- | --- |
| Cognito (`callback_urls`, `logout_urls`) | Cognito solo devuelve al usuario a direcciones de esta lista después de entrar con Google o salir |
| API (`CORS_ORIGINS`) | El navegador solo deja que la tienda lea las respuestas de la API si la API dice "este origen está permitido" |
| API y `notifications` (`STORE_URL`) | La vuelta desde Stripe y el enlace "Ver mi pedido" de los correos |

Por eso basta con agregar la URL de Vercel a `store_urls` en `terraform.tfvars`. La **primera** de la lista es la principal.

Las *previews* de Vercel tienen otra URL, que no está en la lista: ahí la tienda se ve, pero no carga productos ni deja entrar. Para probar cambios usas tu PC; las *previews* solo sirven para ver que compila.

### 5. Publicar la app de Google

Desde el paso 16, la pantalla de consentimiento de Google está en modo **Testing**: solo pueden entrar los correos que agregaste como usuarios de prueba. Un reclutador vería "Acceso bloqueado". Al pasarla a **In production**, cualquiera con cuenta de Google puede entrar.

Pedimos solo `openid`, `email` y `profile`, que Google considera permisos básicos: publicar no requiere la revisión de Google, que sí piden los permisos sensibles, como leer el Gmail o el Drive del usuario.

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

### 2. Encender RDS

La tienda necesita el catálogo:

```bash
aws rds start-db-instance --db-instance-identifier charanatech --profile charanatech
aws rds wait db-instance-available --db-instance-identifier charanatech --profile charanatech
```

### 3. Subir las imágenes nuevas de la API y los workers

Las dos cambiaron (los correos del pedido):

```bash
bash scripts/ecr-push.sh api
bash scripts/ecr-push.sh workers
```

Copia las dos líneas que imprimen (`api_image_tag = "..."` y `workers_image_tag = "..."`) y **reemplaza** las que ya tienes en `infra/terraform/terraform.tfvars`. Todavía no hagas `apply`.

### 4. Crear el proyecto en Vercel

Primero copia las variables de la tienda:

```bash
cd infra/terraform
echo "NEXT_PUBLIC_API_URL=$(terraform output -raw api_url)/api"
echo "NEXT_PUBLIC_AUTH_MODE=cognito"
echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$(terraform output -raw user_pool_id)"
echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=$(terraform output -raw client_id)"
echo "NEXT_PUBLIC_COGNITO_DOMAIN=$(terraform output -raw login_domain)"
echo "ENABLE_EXPERIMENTAL_COREPACK=1"
```

> Después del `apply` del paso 5 basta con `terraform output -raw vercel_environment`, que imprime lo mismo. Antes no existe: un `output` nuevo solo queda guardado en el estado después de un `apply`.

Imprime 6 líneas, de `NEXT_PUBLIC_API_URL=...` a `ENABLE_EXPERIMENTAL_COREPACK=1`. Selecciónalas y cópialas.

Ahora en el navegador:

1. Entra a [vercel.com](https://vercel.com) y crea tu cuenta con **Continue with GitHub**. El plan **Hobby** es gratis y sirve para proyectos personales.
2. **Add New… → Project**. Si no aparece `charana-ecommerce`, pulsa **Adjust GitHub App Permissions** y dale acceso a ese repositorio.
3. Pulsa **Import** junto a `charana-ecommerce`.
4. **Project Name**: `charanatech`. Este nombre decide la URL: `charanatech.vercel.app`.
5. **Root Directory**: pulsa **Edit** y elige `apps/web`. El *Framework Preset* cambia solo a **Next.js**.
6. Abre **Environment Variables** y pega las 6 líneas en el primer campo (*Key*). Vercel las separa solo en 6 variables.
7. Pulsa **Deploy**. Tarda 1 o 2 minutos.

Cuando termine, pulsa **Continue to Dashboard**. En **Domains** está la URL de tu tienda. Si `charanatech.vercel.app` ya estaba tomado, Vercel le pone un sufijo (por ejemplo `charanatech-abc1.vercel.app`). Usa la que aparezca ahí en el resto del paso.

Si abres la tienda ahora, se ve pero **no carga productos**: la API todavía no acepta ese origen (CORS). Eso lo arregla el paso 5.

### 5. La URL de la tienda en Terraform

En `infra/terraform/terraform.tfvars`, agrega (o reemplaza, si ya la tenías) esta línea, con tu URL **sin barra al final**:

```hcl
store_urls = ["https://charanatech.vercel.app", "http://localhost:3001"]
```

La primera es la tienda en internet; la segunda deja que sigas probando en tu PC con Cognito.

```bash
terraform plan
```

Debe decir **`Plan: 0 to add, 6 to change, 0 to destroy`**:

- La Lambda de la **API**: imagen nueva y `STORE_URL`/`CORS_ORIGINS` con la URL de Vercel.
- Las 3 Lambdas de los **workers**: imagen nueva (`notifications` además cambia `STORE_URL`).
- La política de **`notifications`**: puede guardar las copias de los correos.
- El **cliente de Cognito**: las URLs de vuelta de la tienda.

Si dice algo distinto, o algo en *destroy*, para y pégamelo.

```bash
terraform apply
```

### 6. Comprobar que la tienda habla con la API

```bash
TIENDA="https://charanatech.vercel.app"   # tu URL del paso 4
API=$(terraform output -raw api_url)
curl -s -o /dev/null -D - -H "Origin: $TIENDA" "$API/api/products" | grep -i access-control-allow-origin
```

Debe responder `access-control-allow-origin: https://charanatech.vercel.app`. Abre la tienda en el navegador: ya aparecen los 6 productos con sus fotos.

### 7. Publicar la app de Google

En [console.cloud.google.com](https://console.cloud.google.com), con el proyecto del paso 16 elegido, abre **Google Auth Platform**:

1. **Branding**:
   - **Application home page**: `https://charanatech.vercel.app`
   - **Application privacy policy link**: `https://charanatech.vercel.app/privacidad`
   - En **Authorized domains**, agrega `charanatech.vercel.app` (tu dominio de Vercel, sin `https://`).
   - Pulsa **Save**.
2. **Audience** → **Publish app** → **Confirm**. El estado cambia a **In production**.

> Si Google no acepta el dominio de Vercel en *Authorized domains*, deja vacíos los dos enlaces y guarda: con permisos básicos no son obligatorios, y puedes publicar igual.

Puede que Google muestre un aviso de que la app "no está verificada", que la verificación es opcional para los permisos que usas o algo parecido: no hace falta pedirla.

### 8. La compra completa, como un reclutador

Abre la tienda en una **ventana de incógnito** (así no usas tu sesión de `localhost`).

1. **Entrar** → **Continuar con Google**, con tu cuenta. Debe volver a la tienda con tu sesión iniciada.
2. Agrega un producto al carrito → **Continuar compra** → **Pagar con Stripe**.
3. En Stripe usa la tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC y cualquier nombre.
4. Vuelves al pedido: en unos segundos pasa a **Pagado**, a los ~15 s a **Enviado** y a los ~30 s a **Entregado**.
5. Debajo de los productos aparece **Correos de este pedido**, con un correo por cada cambio. Ábrelos para ver el texto.

Si entraste con el correo que verificaste en el paso 32, los correos dicen **Enviado a tu correo** y te llegan (mira en Spam). Para ver lo que verá un reclutador, crea otra cuenta con **Crear cuenta** y un correo que no verificaste en SES: sus correos dicen **No enviado (demo)** y la página explica por qué.

### 9. Apagar RDS si no vas a seguir hoy

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
```

Con RDS apagada, la tienda abre pero sin productos. Antes de mandarle el enlace a alguien, enciéndela.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El build de Vercel falla en `pnpm install` con `Unsupported engine` o una versión de pnpm distinta | Falta `ENABLE_EXPERIMENTAL_COREPACK` | Agrega la variable con valor `1` en **Settings → Environment Variables** y pulsa **Redeploy** |
| La tienda carga pero sin productos, y la consola del navegador dice `CORS` | `store_urls` no tiene la URL exacta de la tienda | Revisa `https://`, que no tenga barra final, y vuelve a hacer `apply` |
| Google responde `redirect_mismatch` o Cognito dice `redirect_uri` inválido | La URL de la tienda no está en `store_urls` | Igual que la fila anterior |
| Google dice "Acceso bloqueado: la app no completó la verificación" | La app sigue en *Testing* | Paso 7, **Publish app** |
| El pedido queda en **Pendiente de pago** después de pagar | El webhook de Stripe no llega a la API | Revisa en Stripe (**Developers → Webhooks**) el último envío del webhook del paso 30 |
| No aparece **Correos de este pedido** | La imagen de los workers no es la nueva, o el pedido aún no se pagó | Paso 3 y `apply`; mira el log de `charanatech-notifications` |
| Cambiaste una variable en Vercel y no se nota | Las `NEXT_PUBLIC_*` se fijan al compilar | **Deployments → ⋯ → Redeploy** |

## Costo

- **Vercel Hobby**: gratis para proyectos personales.
- **DynamoDB**: unos pocos items más por pedido, centavos.
- **Google**: publicar la app es gratis.

## Para la entrevista

- "La tienda está en Vercel, conectada al repo: cada push a `main` publica y cada pull request genera una preview. Es un monorepo pnpm: Root Directory `apps/web` y Corepack para usar la misma versión de pnpm que en local."
- "La URL de la tienda vive en una sola variable de Terraform, `store_urls`, que alimenta las URLs de vuelta de Cognito, el CORS de la API y los enlaces de Stripe y de los correos. Cambiar de dominio es cambiar una línea."
- "SES está en sandbox, así que un reclutador no recibe correos. El worker guarda una copia de cada correo en DynamoDB, con TTL de 90 días, y la página del pedido la muestra como 'el correo que te habríamos enviado'. El rol del worker solo puede escribir claves `ORDER_EMAIL#`."
- "El endpoint de los correos revisa que el pedido sea del usuario y responde 404 si no, igual que el detalle: no revela que el pedido existe."
- "Las variables `NEXT_PUBLIC_*` se fijan en el build y llegan al navegador; por eso solo contienen ids públicos. Terraform genera ese bloque para no copiarlo a mano."
- "Publiqué el consentimiento de Google con solo los permisos básicos `openid`, `email` y `profile`, que no requieren la verificación de Google, y con una política de privacidad propia."
