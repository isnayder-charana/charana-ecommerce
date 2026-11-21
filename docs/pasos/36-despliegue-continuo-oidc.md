# Paso 36 (fase 4): despliegue continuo con OIDC, sin claves guardadas

## Qué hacemos

Hasta ahora, para publicar un cambio de la API o de los workers, tú corrías `scripts/ecr-push.sh`, copiabas la etiqueta a `terraform.tfvars` y hacías `terraform apply`. Desde este paso lo hace **GitHub Actions**: es el **despliegue continuo** (*CD*, *Continuous Deployment*).

```
PR fusionado ──▶ CI en main (paso 35) ──verde──▶ Deploy: espera tu aprobación
                                                    │ token OIDC de GitHub
                                                    ▼
                                          AWS STS: rol charanatech-github-deploy
                                                    │ credenciales de 1 hora
                                                    ▼
                         build ──▶ ECR (api, workers) ──▶ 4 Lambdas con la imagen nueva
```

```
infra/terraform/github.tf             # NUEVO: proveedor OIDC de GitHub y rol de despliegue
infra/terraform/api.tf                # la imagen de la API ya no la cambia Terraform
infra/terraform/modules/worker-lambda # tampoco la de los workers
.github/workflows/deploy.yml          # NUEVO: el despliegue
```

## Las decisiones, una por una

### 1. OIDC: GitHub demuestra quién es, sin claves

Lo fácil sería crear un usuario IAM con una *access key* y guardarla como secreto en GitHub. Es justo lo que evitamos desde el paso 28 (`aws login`, sin claves de larga duración): una clave filtrada sirve hasta que alguien la borre.

Con **OIDC** (*OpenID Connect*):

1. En cada ejecución, GitHub firma un token que dice "soy el repo `isnayder-charana/charana-ecommerce`, environment `production`".
2. AWS verifica la firma con el **proveedor OIDC** que registramos (`token.actions.githubusercontent.com`).
3. Si el token cumple las condiciones del rol, AWS entrega **credenciales temporales** que duran 1 hora como máximo.

No hay nada que robar: no existe una clave guardada en ningún lado.

### 2. Solo el environment `production` puede asumir el rol

La condición del rol es exacta:

```
token.actions.githubusercontent.com:sub = repo:isnayder-charana@134728698/charana-ecommerce@1463310450:environment:production
```

Los números son los **ID inmutables** del dueño y del repositorio. Desde julio de 2026, GitHub firma así los tokens de los repos nuevos, como este: el nombre puede cambiar, pero el ID no. Por eso, si alguien borra el repo y crea otro con el mismo nombre, tampoco entra. El rol acepta también el formato clásico, sin números, por si GitHub lo vuelve a enviar.

- Otro repositorio, o un *fork*, tiene otro `repo:`. No entra.
- El CI de un pull request no corre en el environment `production`. No entra.
- En GitHub, el environment `production` exige **tu aprobación** y solo acepta la rama `main`.

Así, aunque alguien abra un pull request con un workflow malicioso, no puede tocar AWS.

### 3. Permisos mínimos: imágenes y Lambdas, nada más

El rol puede:

- Subir imágenes a los dos repos de ECR (`charanatech-api` y `charanatech-workers`).
- Cambiar la imagen de las 4 Lambdas (`lambda:UpdateFunctionCode`), solo esas 4.

No puede crear recursos, leer secretos de SSM, tocar IAM ni la base de datos. Si alguien lograra usarlo, lo peor que podría hacer es desplegar una imagen.

### 4. Quién cambia qué: Terraform la infraestructura, GitHub el código

Para que el rol sea tan pequeño, separamos responsabilidades:

| Qué | Quién lo cambia | Cómo |
| --- | --- | --- |
| Infraestructura (colas, tablas, permisos, variables de las Lambdas…) | Tú, desde tu PC | `terraform plan` y `apply`, leyendo el plan |
| La **imagen** de cada Lambda (el código) | GitHub Actions | `deploy.yml`, con tu aprobación |

Para que no se pisen, Terraform ahora **ignora** la imagen de las Lambdas (`lifecycle { ignore_changes = [image_uri] }`). `api_image_tag` y `workers_image_tag` de `terraform.tfvars` solo sirven si alguna vez Terraform tiene que crear la función desde cero.

La otra opción era que GitHub corriera `terraform apply`. Para eso el rol necesitaría permisos sobre todo (IAM, RDS, Cognito…) y los secretos de `terraform.tfvars` vivirían en GitHub. Para un cambio de código no hace falta tanto.

### 5. Desplegar solo lo que pasó el CI

`deploy.yml` no se dispara con cada push. Se dispara cuando **el CI de `main` termina en verde** (`workflow_run`), y despliega exactamente ese commit. Además revisa que:

- el CI haya sido de un **push** a `main`, no de un pull request;
- venga de **este** repositorio. Un *fork* con una rama llamada `main` no cuenta.

También puedes lanzarlo a mano (**Run workflow**) para volver a desplegar `main`.

### 6. Las migraciones de la base siguen siendo manuales

El despliegue no corre `prisma migrate`. Cambiar el esquema de la base es raro en este proyecto, y conviene hacerlo a propósito. Cuando haga falta, lo haremos desde tu PC como en el paso 30.

## Hazlo en tu PC

Todo en **Git Bash**. Este paso no necesita RDS encendida.

### 1. Traer `main` con este paso

Cuando hayas fusionado el pull request:

```bash
cd /d/Projects/charanatech
git switch main
git pull
aws login --profile charanatech
```

Al fusionar, en la pestaña **Actions** de GitHub aparece un **Deploy** marcado como omitido (*skipped*). Es normal: todavía no existe la variable `AWS_DEPLOY_ROLE_ARN`.

### 2. Crear el rol en AWS

```bash
cd infra/terraform
terraform plan
```

Debe decir **`Plan: 3 to add, 0 to change, 0 to destroy`**: el proveedor OIDC, el rol y su política. Que las Lambdas ignoren la imagen no cambia nada en AWS. Si dice algo distinto, para y pégamelo.

```bash
terraform apply
```

Copia los dos valores que vas a pegar en GitHub:

```bash
terraform output -raw github_deploy_role_arn; echo
terraform output -raw api_url; echo
```

### 3. El environment `production` en GitHub

En el repo: **Settings → Environments → New environment**.

1. **Name**: `production` (exacto, en minúsculas) → **Configure environment**.
2. Marca **Required reviewers** y agrégate tú.
3. Desmarca **Prevent self-review**, si aparece marcada. Trabajas solo: tienes que poder aprobar tus propios despliegues.
4. En **Deployment branches and tags**, elige **Selected branches and tags** → **Add deployment branch or tag rule** → `main` → **Add rule**.
5. **Save protection rules**.

### 4. Las variables del workflow

**Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**, dos veces:

| Name | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::...:role/charanatech-github-deploy` (el primer output) |
| `API_URL` | `https://...execute-api.us-east-2.amazonaws.com` (el segundo output, sin `/api`) |

Son **variables**, no secretos: el ARN del rol no da acceso a nada por sí solo. Para usarlo hay que ser este repo, en `production`, con tu aprobación.

### 5. El primer despliegue

1. **Actions → Deploy → Run workflow** → rama `main` → **Run workflow**.
2. El job se queda en **Waiting**. Pulsa **Review deployments**, marca `production` y pulsa **Approve and deploy**.
3. Tarda unos 3 minutos. Al terminar, la página del workflow muestra **Desplegado `abc1234`**.

Compruébalo desde tu PC:

```bash
git rev-parse --short HEAD
aws lambda get-function --function-name charanatech-api \
  --query Code.ImageUri --output text --profile charanatech
```

La imagen debe terminar en `:` más el mismo commit que imprimió `git rev-parse`. Abre la tienda en Vercel: todo sigue funcionando.

### 6. Desde ahora

1. Fusionas un pull request.
2. Corre el CI en `main` (1 minuto).
3. **Deploy** te pide aprobación: GitHub te avisa por correo y en la pestaña **Actions**.
4. Apruebas, y en 3 minutos la API y los workers corren el código nuevo. La tienda la publica Vercel por su lado.

`scripts/ecr-push.sh` queda solo para emergencias: por ejemplo, si GitHub Actions no funciona.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| **Deploy** sale como *skipped* | Falta la variable `AWS_DEPLOY_ROLE_ARN`, o el CI de `main` falló | Paso 4; revisa el CI |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | El environment no se llama exactamente `production`, o el token trae otro `sub` (repo renombrado o recreado) | Revisa el nombre del environment; si cambió el repo, ajusta `github_repository`, `github_owner_id` y `github_repository_id` en Terraform |
| Se queda en **Waiting** | Espera tu aprobación | **Review deployments → Approve and deploy** |
| `AccessDeniedException` en `UpdateFunctionCode` | El rol no tiene esa función en su política | Pégame el log |
| Falla **Comprobar que la API responde** | La API no arranca con la imagen nueva | Mira `aws logs tail /aws/lambda/charanatech-api --since 10m`; vuelve a desplegar el commit anterior con `ecr-push.sh` y la consola de Lambda |
| **Comprobar que la API responde** falla por *timeout* | `API_URL` mal escrita (sin `https://`, con `/api`, barra o espacio al final) | Corrígela en **Settings → Secrets and variables → Actions → Variables** y vuelve a lanzar **Deploy** |

## Costo

- **GitHub Actions**: gratis en repos públicos.
- **IAM y OIDC**: gratis.
- **ECR**: cada despliegue guarda dos imágenes nuevas, de unos 100 MB. La regla de ECR deja solo las últimas 10 por repo: unos centavos al mes.

## Para la entrevista

- "El despliegue no usa claves de AWS: GitHub Actions se autentica con OIDC. AWS verifica el token firmado por GitHub y entrega credenciales temporales de una hora."
- "La política de confianza del rol exige este repositorio y el environment `production`, que solo acepta `main` y pide mi aprobación. Un PR o un fork no pueden asumir el rol."
- "El rol tiene permisos mínimos: subir imágenes a dos repos de ECR y actualizar el código de cuatro Lambdas. No puede crear infraestructura ni leer secretos."
- "Separé responsabilidades: Terraform gestiona la infraestructura con `ignore_changes` sobre la imagen, y el pipeline despliega el código. Así el pipeline no necesita permisos de administrador ni los secretos de Terraform."
- "El despliegue se dispara con `workflow_run` cuando el CI de `main` termina en verde, y despliega exactamente ese commit. Comprueba que el evento sea un push de este repo, para que un fork con una rama `main` no lo dispare."
- "Las imágenes se etiquetan con el commit en repos ECR inmutables: siempre sé qué código corre, y volver atrás es desplegar una etiqueta anterior."
