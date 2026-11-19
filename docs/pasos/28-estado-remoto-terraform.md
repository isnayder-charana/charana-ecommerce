# Paso 28 (fase 4): el estado de Terraform se muda a S3

## Qué hacemos

Terraform recuerda qué creó en AWS en un archivo, el **estado** (`terraform.tfstate`). Desde el paso 15 ese archivo vive en tu PC. Eso tiene tres problemas:

1. **GitHub Actions no lo ve.** En el paso 36 el despliegue corre en GitHub, no en tu PC. Sin el estado, Terraform creería que nada existe e intentaría crear todo otra vez.
2. **Si tu disco falla, Terraform pierde la memoria.** Los recursos siguen en AWS, pero ya no sabe que son suyos.
3. **Dos `apply` a la vez se pisan.** Tu PC y GitHub podrían escribir el estado al mismo tiempo.

La solución estándar es un **backend remoto**: el estado vive en un bucket de S3, versionado y cifrado, y un archivo de bloqueo impide dos `apply` simultáneos.

```
infra/terraform/
├─ bootstrap/main.tf        # NUEVO: crea el bucket del estado (se aplica una sola vez)
├─ versions.tf              # backend "s3" con use_lockfile
├─ backend.hcl.example      # NUEVO: plantilla con tu bucket y perfil
└─ backend.hcl              # tu copia (ignorada por git)
```

## El problema del huevo y la gallina

El estado remoto necesita un bucket, y el bucket lo queremos crear con Terraform… ¿dónde guarda Terraform el estado de ese bucket?

Respuesta: en un **mini-proyecto aparte**, `infra/terraform/bootstrap/`, que guarda su estado en local. Solo crea el bucket y se aplica una vez. Si algún día pierdes ese estado local no pasa nada grave: el bucket sigue ahí y tiene `prevent_destroy`, que bloquea cualquier intento de borrarlo con Terraform.

El bucket tiene cuatro protecciones, cada una en su propio recurso de `bootstrap/main.tf`:

| Protección | Recurso | Para qué |
| --- | --- | --- |
| Versionado | `aws_s3_bucket_versioning` | Cada `apply` guarda una versión nueva; puedes volver a la anterior |
| Cifrado | `aws_s3_bucket_server_side_encryption_configuration` | El estado puede tener datos sensibles |
| Sin acceso público | `aws_s3_bucket_public_access_block` | Nadie de internet lo lee, aunque te equivoques con una política |
| Solo HTTPS | `aws_s3_bucket_policy` | Rechaza cualquier petición sin TLS |

Y una regla de ciclo de vida borra las versiones viejas a los 90 días, para que el bucket no crezca sin fin.

## El bloqueo: `use_lockfile`

Mientras alguien hace `plan` o `apply`, Terraform crea `charanatech/terraform.tfstate.tflock` en el bucket. Si otro proceso intenta lo mismo, ve el archivo y espera en vez de pisar el estado.

Antes esto exigía una tabla de DynamoDB solo para el bloqueo. Desde Terraform 1.10, S3 lo hace solo con `use_lockfile = true`: una pieza menos que crear y pagar.

## Por qué existe `backend.hcl`

El bloque `backend` se lee **antes** que todo lo demás, así que no acepta variables. El nombre del bucket lleva tu ID de cuenta y el perfil es de tu PC, así que no los escribimos en `versions.tf`. Van en un archivo aparte que se pasa al hacer `init`:

```bash
terraform init -backend-config=backend.hcl
```

En el paso 36, GitHub Actions usará su propia configuración, sin perfil (sus credenciales llegan por OIDC).

## Hazlo en tu PC

Todo en **Git Bash**.

### 1. Traer la rama de este paso

```bash
cd /d/Projects/charanatech
git fetch origin
git switch feat/terraform-remote-state
```

### 2. Iniciar sesión en AWS

```bash
aws login --profile charanatech
```

### 3. Crear el bucket (bootstrap)

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
```

El plan debe decir **`Plan: 6 to add, 0 to change, 0 to destroy`**: el bucket, su versionado, el ciclo de vida, el cifrado, el bloqueo público y la política. Si dice otra cosa, para y pégamelo.

```bash
terraform apply
terraform output state_bucket
```

Copia el nombre que imprime (algo como `charanatech-tfstate-123456789012`).

### 4. Configurar el backend

```bash
cd ..
cp backend.hcl.example backend.hcl
```

Abre `backend.hcl` y pon el nombre del bucket del paso anterior. El perfil se queda como `charanatech`.

### 5. Mudar el estado de Cognito a S3

```bash
terraform init -migrate-state -backend-config=backend.hcl
```

Terraform detecta que antes el estado era local y pregunta:

> Do you want to copy existing state to the new backend?

Responde **`yes`**. Copia tu `terraform.tfstate` local al bucket.

### 6. Comprobar que no cambió nada

```bash
terraform plan
```

Debe decir **`No changes. Your infrastructure matches the configuration.`** Eso prueba que Terraform sigue reconociendo tu User Pool, el cliente y Google, ahora leyendo el estado desde S3.

Si en vez de eso quiere **crear** el User Pool, **no hagas apply**: significa que la migración no copió el estado. Pégame la salida.

#### Lo que pasó en tu PC: "drift" en el proveedor de Google

En la primera prueba, el `plan` no dijo "No changes" sino `0 to add, 1 to change`: quería **quitar** seis valores de `provider_details` del proveedor de Google (`authorize_url`, `token_url`, `oidc_issuer`…).

Esa es la señal de que la migración **sí funcionó**: Terraform encontró el User Pool y los demás recursos en el estado de S3 (0 to add). El cambio era otra cosa, un *drift*: cuando creamos el proveedor en el paso 16, Cognito completó esos seis valores por su cuenta. Nuestro código no los mencionaba, así que Terraform creía que sobraban.

La solución fue escribirlos en `google.tf` con los mismos valores que guarda AWS. Así el código describe exactamente lo que existe, y el `plan` vuelve a decir **No changes**.

Regla general: si un `plan` quiere cambiar algo que tú no tocaste, no hagas `apply` a ciegas. Primero entiende de dónde viene la diferencia.

### 7. Guardar el lockfile del bootstrap y subirlo

`terraform init` creó `bootstrap/.terraform.lock.hcl`. Súbelo, igual que el de `infra/terraform`:

```bash
cd /d/Projects/charanatech
git status --short
git add infra/terraform/bootstrap/.terraform.lock.hcl
git commit -m "chore: add provider lockfile for the state bootstrap"
git push
```

En `git status` **no** deben aparecer `backend.hcl` ni ningún `terraform.tfstate`: el `.gitignore` los excluye.

### 8. Apartar el estado local viejo

Después del paso 6 en verde, el `terraform.tfstate` que quedó en `infra/terraform/` ya no se usa: Terraform lee el de S3. Muévelo fuera del proyecto como respaldo, por si acaso, y bórralo en unos días:

```bash
mkdir -p ~/charanatech-respaldo
mv infra/terraform/terraform.tfstate* ~/charanatech-respaldo/
```

**No** muevas `infra/terraform/bootstrap/terraform.tfstate`: es la memoria del bucket.

## Cómo sé que funcionó

- En la consola de AWS, en **S3**, el bucket `charanatech-tfstate-…` tiene el objeto `charanatech/terraform.tfstate`.
- `terraform plan` en `infra/terraform` dice **No changes**.
- En la pestaña **Properties** del bucket, "Bucket Versioning" dice **Enabled**.
- Si corres `terraform plan` en dos terminales a la vez, la segunda muestra `Error acquiring the state lock` hasta que la primera termina.

## Si `aws login` no le sirve al backend

El provider de AWS lee las credenciales de `aws login` sin problema (lo comprobamos en el paso 15). Si `terraform init` dice que no encuentra credenciales para el backend, avísame. La solución es una línea en `~/.aws/config` que le pide las credenciales a la CLI (`credential_process`).

## Costo

S3 cobra por GB guardado y por petición. El estado pesa unos KB y cada `plan` hace unas pocas peticiones: son centavos al año, dentro de tus créditos.

## Para la entrevista

- "El estado de Terraform está en S3 con versionado, cifrado, acceso público bloqueado y una política que exige TLS. Uso el bloqueo nativo de S3 (`use_lockfile`), sin la tabla de DynamoDB que se usaba antes de Terraform 1.10."
- "El bucket del estado lo creo con un proyecto de bootstrap aparte, con estado local y `prevent_destroy`, para resolver el problema del huevo y la gallina."
- "La configuración del backend es parcial (`-backend-config`): el código no lleva el ID de la cuenta, y CI y mi PC usan credenciales distintas sobre el mismo estado."
