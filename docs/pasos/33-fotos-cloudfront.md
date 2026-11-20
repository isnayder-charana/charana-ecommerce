# Paso 33 (fase 4): fotos de los productos en S3 + CloudFront

## Qué hacemos

Hasta ahora los productos no tenían foto: la tienda mostraba un dibujo de su categoría. En este paso cada producto tiene una foto real, guardada en S3 y servida por **CloudFront**, la CDN de AWS:

```
navegador ──HTTPS──▶ CloudFront (copias cerca del usuario)
                          │ firma cada petición (OAC)
                          ▼
                  S3 charanatech-images-<cuenta>   (privado)
```

```
apps/web/public/products/     # las fotos (tú las agregas): ct-aud-001.jpg, ...
apps/api/src/scripts/seed.ts  # con PRODUCT_IMAGES_URL, cada producto apunta a su foto
infra/terraform/images.tf     # NUEVO: bucket privado, CloudFront y la subida de fotos
README.md                     # NUEVO: créditos de las fotos
```

## Las decisiones, una por una

### 1. Una foto por SKU, en el repo

Cada foto se llama como el SKU del producto, en minúsculas: el producto `CT-AUD-001` usa `ct-aud-001.jpg`. Así nadie tiene que mantener una lista que relacione productos con archivos.

Las fotos viven en `apps/web/public/products/`, dentro del repo:

- En tu PC, Next.js sirve esa carpeta: `http://localhost:3001/products/ct-aud-001.jpg`.
- En AWS, Terraform sube los mismos archivos al bucket (`aws_s3_object`, uno por foto). Si cambias una foto, cambia su huella (`etag`) y Terraform la vuelve a subir.

La semilla (`pnpm db:seed`) arma la URL de cada foto con la variable `PRODUCT_IMAGES_URL`. En tu PC es `http://localhost:3001/products`; en AWS, la dirección de CloudFront.

### 2. El bucket es privado; solo CloudFront entra

El bucket no es público: tiene el **bloqueo de acceso público** activado. CloudFront entra con **OAC** (*Origin Access Control*): firma cada petición que hace a S3, y la política del bucket solo acepta las firmadas por **esta** distribución.

¿Por qué no hacer público el bucket, que es más simple?

- Si alguien encuentra la URL directa de S3, podría descargar las fotos sin pasar por el CDN, y cada descarga de S3 se paga.
- Con todo cerrado, un error en una política no expone nada.

### 3. Por qué una CDN

CloudFront guarda copias de las fotos en servidores repartidos por el mundo (*edge locations*). La primera visita trae la foto desde S3 en Ohio; las siguientes salen de la copia más cercana al visitante, mucho más rápido.

- `cache_control = "public, max-age=86400"`: el navegador y CloudFront guardan la foto un día.
- `PriceClass_100`: solo usa los puntos de Norteamérica y Europa, los más baratos. Desde Perú igual funciona, solo que desde un punto un poco más lejano.
- `redirect-to-https`: si alguien pide `http://`, lo manda a `https://`.

### 4. `<img>` y no `next/image`

Next.js tiene un componente `<Image>` que optimiza las fotos al vuelo. En Vercel esa optimización se cobra por imagen, y nuestras fotos ya llegan del tamaño correcto desde CloudFront. Por eso usamos `<img>` con `loading="lazy"`: el navegador solo descarga las fotos que van apareciendo en pantalla.

## Hazlo en tu PC

Todo en **Git Bash**.

### 1. Traer `main` con este paso

Cuando hayas fusionado el pull request:

```bash
cd /d/Projects/charanatech
git switch main
git pull
```

### 2. Elegir y descargar las 6 fotos

En [unsplash.com](https://unsplash.com) busca una foto para cada producto. Sugerencias de búsqueda:

| Producto | Busca | Guárdala como |
| --- | --- | --- |
| Audífonos inalámbricos Pulse | `wireless headphones` | `ct-aud-001.jpg` |
| Cargador GaN 65W | `usb c charger` | `ct-chg-001.jpg` |
| Cable USB-C trenzado 2 m | `usb c cable` | `ct-cab-001.jpg` |
| Teclado mecánico compacto | `mechanical keyboard` | `ct-per-001.jpg` |
| Mouse ergonómico vertical | `computer mouse` | `ct-per-002.jpg` |
| SSD portátil 1 TB | `portable ssd` | `ct-sto-001.jpg` |

Consejos para que la tienda se vea bien:

- Elige fotos con **fondo limpio** y el producto centrado. La tienda las muestra **cuadradas** y recorta los bordes.
- Descarga el tamaño **Small** (en el botón *Download*, la flecha de al lado). Pesa unos 50 a 100 KB, suficiente para la tienda. El original puede pesar varios MB.
- Anota el **nombre del autor** de cada foto: va en los créditos.

Guarda los 6 archivos en `D:\Projects\charanatech\apps\web\public\products\`, con los nombres exactos de la tabla (minúsculas y `.jpg`).

Comprueba que están todos:

```bash
ls apps/web/public/products/
```

Deben aparecer los 6 `.jpg` (y un `.gitkeep`, que solo sirve para que la carpeta exista en git).

> La licencia de Unsplash permite usarlas gratis, también en proyectos comerciales, sin pedir permiso. Dar crédito no es obligatorio, pero es lo correcto, y en un portafolio muestra cuidado.

### 3. Los créditos en el README

Al final del `README.md` hay una tabla **Créditos de las fotos**. Cambia cada `_pendiente_` por el autor, con el enlace a su perfil. Por ejemplo:

```markdown
| Audífonos inalámbricos Pulse | `ct-aud-001.jpg` | [Ana Pérez](https://unsplash.com/@anaperez) |
```

### 4. (Opcional) Verlas en tu PC

Si quieres verlas antes de subirlas, con Docker Desktop abierto:

1. Agrega esta línea a `apps/api/.env` (ya está en `.env.example`):

   ```
   PRODUCT_IMAGES_URL=http://localhost:3001/products
   ```

2. Carga las fotos en la base local y arranca todo:

   ```bash
   pnpm infra:up
   pnpm --filter @charanatech/api db:seed
   pnpm dev
   ```

Abre `http://localhost:3001`: cada producto debe mostrar su foto.

### 5. Subir las fotos al repo

```bash
cd /d/Projects/charanatech
pnpm exec prettier --write README.md
git status --short
git add apps/web/public/products README.md
git commit -m "feat: add product photos with credits"
git push
```

`prettier` vuelve a alinear las columnas de la tabla que editaste (el repo exige ese formato). En `git status` deben aparecer los 6 `.jpg` y el `README.md`, nada más.

### 6. Crear el bucket y CloudFront

```bash
aws login --profile charanatech
cd infra/terraform
terraform plan
```

El plan debe decir **`Plan: 12 to add, 0 to change, 0 to destroy`**:

| Qué | Cuántos |
| --- | --- |
| Bucket, su bloqueo de acceso público y su cifrado | 3 |
| Las fotos (una por archivo) | 6 |
| OAC, distribución de CloudFront y política del bucket | 3 |

Si ves menos fotos, revisa los nombres del paso 2: Terraform solo sube los `.jpg` de esa carpeta.

```bash
terraform apply
```

Crear la distribución de CloudFront tarda **unos 5 minutos**: es normal que el `apply` se quede en `Still creating...`.

### 7. Probar CloudFront

```bash
FOTOS=$(terraform output -raw product_images_url)
echo "$FOTOS"
curl -sI "$FOTOS/ct-aud-001.jpg" | grep -iE '^HTTP|content-type|x-cache'
curl -sI "$FOTOS/ct-aud-001.jpg" | grep -iE '^HTTP|x-cache'
```

- Las dos veces debe decir **`HTTP/2 200`** y `content-type: image/jpeg`.
- La primera vez, `x-cache: Miss from cloudfront` (la trajo de S3). La segunda, **`Hit from cloudfront`**: salió de la copia del CDN.

Ahora comprueba que el bucket **no** se puede leer directo:

```bash
BUCKET="charanatech-images-$(aws sts get-caller-identity --query Account --output text --profile charanatech)"
curl -sI "https://$BUCKET.s3.us-east-2.amazonaws.com/products/ct-aud-001.jpg" | head -1
```

Debe decir **`HTTP/1.1 403 Forbidden`**. Las fotos solo salen por CloudFront.

### 8. Apuntar los productos de RDS a sus fotos

Enciende RDS si estaba apagada:

```bash
aws rds start-db-instance --db-instance-identifier charanatech --profile charanatech
aws rds wait db-instance-available --db-instance-identifier charanatech --profile charanatech
```

Corre la semilla contra RDS, igual que en el paso 30 pero con `PRODUCT_IMAGES_URL`:

```bash
cd /d/Projects/charanatech/apps/api

export DATABASE_URL="$(MSYS_NO_PATHCONV=1 aws ssm get-parameter \
  --name /charanatech/prod/database-url --with-decryption \
  --query Parameter.Value --output text --profile charanatech \
  | sed "s#/app/certs/rds-ca.pem#$(cygpath -m ~/rds-ca.pem)#")"
export PRODUCT_IMAGES_URL="$FOTOS"

pnpm db:seed
unset DATABASE_URL PRODUCT_IMAGES_URL
```

Debe terminar con:

```
Seed: 6 productos listos en charanatech
Fotos desde https://d1234abcd.cloudfront.net/products
```

La semilla no toca nada más de los productos que ya existen: solo actualiza su `imageUrl`.

### 9. Ver las fotos desde la API

```bash
cd /d/Projects/charanatech/infra/terraform
API=$(terraform output -raw api_url)
curl -s "$API/api/products" | grep -o '"imageUrl":"[^"]*"'
```

Deben aparecer las 6 URLs de CloudFront. La tienda de Vercel (paso 34) las mostrará.

### 10. Apagar RDS si no vas a seguir hoy

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
```

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El plan sube menos de 6 fotos | Nombre o extensión distinta (`.JPG`, `.jpeg`, mayúsculas) | Renombra como en la tabla del paso 2 |
| `curl` a CloudFront da `403` | La distribución todavía se está desplegando | Espera 5 minutos y repite |
| `curl` a CloudFront da `404` | La foto no está en el bucket | `terraform output product_images_uploaded` |
| La semilla dice `Sin PRODUCT_IMAGES_URL` | No se exportó la variable | Repite el paso 8 en la misma terminal donde definiste `FOTOS` |

## Costo

- **S3**: unos MB de fotos, menos de un centavo al mes.
- **CloudFront**: el primer TB de transferencia y 10 millones de peticiones al mes son gratis.

## Para la entrevista

- "Las fotos están en un bucket S3 privado, con bloqueo de acceso público. Solo CloudFront puede leerlas, con Origin Access Control: la política del bucket acepta únicamente peticiones firmadas por esa distribución."
- "CloudFront cachea en el edge con la política administrada CachingOptimized y `Cache-Control` de un día; comprobé el `Miss` y luego el `Hit` en la cabecera `x-cache`."
- "Las fotos viven en el repo y Terraform las sube con `aws_s3_object` y su `etag`: cambiar una foto es un commit y un apply."
- "No uso `next/image` porque Vercel cobra la optimización por imagen y las fotos ya llegan con el tamaño correcto desde el CDN. Uso `<img loading=\"lazy\">`."
