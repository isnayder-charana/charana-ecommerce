# Paso 15 (fase 2): Terraform y el User Pool de Cognito

## Qué hicimos

Creamos el **User Pool de Cognito** real en tu cuenta de AWS, pero sin hacer clics en la consola: lo describimos en archivos de **Terraform** y Terraform lo crea. Al final de este paso, la API acepta tokens **reales** de Cognito.

```
infra/terraform/
├─ versions.tf    # versión de Terraform y del proveedor de AWS (fijas), región y perfil
├─ variables.tf   # región, perfil de la CLI y URLs de la tienda
├─ cognito.tf     # User Pool, grupo admin, dominio y cliente de la tienda
└─ outputs.tf     # los valores que copias a los .env
```

## ¿Qué es Terraform y por qué no hacerlo a mano?

Terraform es **infraestructura como código**: en vez de entrar a la consola y crear cosas con clics, escribes en un archivo **cómo quieres que quede** y Terraform se encarga de llegar ahí.

- **Se puede repetir:** si mañana borras todo, `terraform apply` lo vuelve a crear igual.
- **Se puede revisar:** los cambios a la infraestructura pasan por el repo como cualquier código.
- **Es declarativo:** no dices "crea un pool", dices "debe existir un pool así". Si ya existe, Terraform no hace nada; si cambiaste algo, solo cambia eso.

En la fase 4, la misma carpeta crea Lambda, API Gateway, la base de datos, etc. Empezar ahora con Cognito evita hacerlo dos veces.

## Las piezas de Terraform

| Pieza | Ejemplo | Para qué |
| --- | --- | --- |
| `provider` | `provider "aws"` | El "conector" con AWS: región y credenciales |
| `resource` | `aws_cognito_user_pool.store` | Algo que Terraform **crea y administra** |
| `data` | `aws_caller_identity.current` | Algo que Terraform solo **lee** (aquí, tu número de cuenta) |
| `variable` | `var.store_urls` | Un valor que se puede cambiar sin tocar el código |
| `output` | `user_pool_id` | Un valor que Terraform te muestra al terminar |

Las piezas se conectan entre sí: el grupo usa `aws_cognito_user_pool.store.id`, así que Terraform sabe que primero debe crear el pool. No tienes que decirle el orden.

### El estado (`terraform.tfstate`)

Terraform anota en `terraform.tfstate` qué creó y con qué id. Así, la próxima vez compara **lo que dicen los archivos** con **lo que anotó** y solo hace la diferencia.

- No lo edites a mano y **no lo borres**: Terraform "olvidaría" el pool y trataría de crear otro.
- Está en `.gitignore`: puede contener datos sensibles. En la fase 4 lo movemos a un bucket de S3.

### Versiones fijas

`versions.tf` fija Terraform `~> 1.17.1` y el proveedor de AWS en `6.72.0`, igual que fijamos las versiones de pnpm. Al ejecutar `terraform init` se crea **`.terraform.lock.hcl`** con las huellas de lo descargado: ese archivo **sí va al repo**.

## Qué crea `cognito.tf`

**User Pool `charanatech-store`**, el directorio de usuarios de la tienda:
- El **correo es el usuario** y no distingue mayúsculas.
- Al registrarte, Cognito envía un **código de verificación** al correo.
- Contraseña de mínimo 8 caracteres, con mayúscula, minúscula y número.
- `deletion_protection = "ACTIVE"`: un `terraform destroy` por error no borra a todos los usuarios.

**Grupo `admin`**: la API ya lo lee del token (`cognito:groups`) para las rutas `@AdminOnly()` (paso 5).

**Dominio** `charanatech-<tu número de cuenta>.auth.us-east-2.amazoncognito.com`: lo usa el inicio de sesión con Google (paso 16). El prefijo tiene que ser único en todo AWS, por eso lleva tu número de cuenta.

**Cliente de la tienda (App Client) `charanatech-web`**:
- **Sin secreto** (`generate_secret = false`). La tienda corre en el navegador, y cualquier secreto ahí se puede leer con las herramientas de desarrollador. Por eso es un **cliente público** y se protege con **PKCE**.
- `ALLOW_USER_SRP_AUTH`: Amplify inicia sesión con SRP, un protocolo en el que la contraseña **nunca viaja** tal cual, ni siquiera cifrada.
- `ALLOW_ADMIN_USER_PASSWORD_AUTH`: solo funciona con **credenciales de AWS**, así que el navegador no puede usarlo. Lo usamos abajo para probar desde la terminal.
- Después de iniciar sesión, Cognito solo puede devolver al usuario a `http://localhost:3001/auth/callback`. Si alguien intenta usar tu login para mandar a la gente a otro sitio, Cognito lo rechaza.
- `prevent_user_existence_errors`: si alguien prueba un correo que no existe, la respuesta es igual que con una contraseña incorrecta. Así no se puede averiguar quién tiene cuenta.
- El access token dura **60 minutos** y la sesión se renueva sola durante **30 días**.

## Cómo ejecutarlo (en tu PC)

Primero inicia sesión en AWS (si ya lo hiciste hace poco, no hace falta):

```bash
aws login --profile charanatech
```

Luego, desde la raíz del repo:

```bash
cd infra/terraform
terraform init      # descarga el proveedor de AWS (solo la primera vez)
terraform plan      # muestra QUÉ va a crear, sin crear nada
terraform apply     # lo crea; te pide escribir "yes"
```

`terraform plan` debería decir **`Plan: 4 to add, 0 to change, 0 to destroy`**. Léelo siempre antes de aplicar: es tu oportunidad de ver si algo se va a borrar.

Al terminar verás los valores de salida:

```
client_id    = "1a2b3c..."
login_domain = "charanatech-123456789012.auth.us-east-2.amazoncognito.com"
region       = "us-east-2"
user_pool_id = "us-east-2_AbCdEf123"
```

Puedes volver a verlos cuando quieras con `terraform output`.

### Si Terraform no encuentra tus credenciales

Las credenciales de `aws login` son nuevas y algunas herramientas todavía no las leen. Si `terraform plan` dice algo como *"No valid credential sources found"*, agrega este perfil a `C:\Users\<tu usuario>\.aws\config`:

```ini
[profile charanatech-tf]
credential_process = aws configure export-credentials --profile charanatech --format process
region = us-east-2
```

Ese perfil le pide las credenciales a la AWS CLI cada vez que Terraform las necesita. Luego ejecuta `terraform plan -var aws_profile=charanatech-tf` (y lo mismo con `apply`).

## Conectar la API con Cognito

En `apps/api/.env`, cambia el modo de autenticación y pega los dos valores:

```
AUTH_MODE=cognito
COGNITO_USER_POOL_ID=us-east-2_AbCdEf123
COGNITO_CLIENT_ID=1a2b3c...
```

Reinicia la API (`pnpm --filter @charanatech/api dev`). La región de Cognito sale del propio id del pool, así que no cambia nada más.

## Probarlo con un token real

Usa **Git Bash** desde la raíz del repo. Primero guarda los valores en variables para no copiarlos cada vez:

```bash
POOL=$(terraform -chdir=infra/terraform output -raw user_pool_id)
CLIENT=$(terraform -chdir=infra/terraform output -raw client_id)
EMAIL=tu-correo@gmail.com
```

**1. Crea un usuario de prueba** con el correo ya verificado y una contraseña definitiva:

```bash
aws cognito-idp admin-create-user --profile charanatech --user-pool-id $POOL \
  --username $EMAIL --message-action SUPPRESS \
  --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true

aws cognito-idp admin-set-user-password --profile charanatech --user-pool-id $POOL \
  --username $EMAIL --password 'Prueba1234' --permanent
```

**2. Inicia sesión y guarda el access token:**

```bash
TOKEN=$(aws cognito-idp admin-initiate-auth --profile charanatech --user-pool-id $POOL \
  --client-id $CLIENT --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=$EMAIL,PASSWORD=Prueba1234 \
  --query AuthenticationResult.AccessToken --output text)
```

Si quieres ver qué hay dentro del token, pégalo en [jwt.io](https://jwt.io): verás `sub`, `client_id`, `token_use: "access"` y `exp`. Pegarlo ahí es seguro solo porque es de prueba y vence en una hora.

**3. Llama a la API:**

```bash
curl -i http://localhost:3000/api/orders                                # 401: sin token
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/orders  # 200: tus pedidos (ninguno aún)
curl -i -H "Authorization: Bearer dev:ana" http://localhost:3000/api/orders # 401: el token de prueba ya no sirve
```

**4. (Opcional) Hazte admin.** Te agregas al grupo y vuelves a pedir el token (el grupo viaja dentro del token, así que hace falta uno nuevo):

```bash
aws cognito-idp admin-add-user-to-group --profile charanatech --user-pool-id $POOL \
  --username $EMAIL --group-name admin
```

Con ese nuevo token, `PATCH /api/orders/{id}/status` responde 200 en vez de 403.

Para volver a desarrollar sin AWS, pon `AUTH_MODE=dev` en `apps/api/.env`. Las dos formas siguen funcionando.

## Costo

**USD 0.** Cognito no cobra hasta 10 000 usuarios activos al mes, y los correos de verificación salen gratis desde Cognito (unos 50 al día). Además, tu cuenta está en el plan gratuito con límite de gasto.

## Lo que aprendiste

- **Infraestructura como código:** describir el resultado y dejar que Terraform calcule los pasos.
- **`plan` antes de `apply`:** ver el cambio antes de hacerlo, igual que revisar un diff antes de un commit.
- **El estado** es la memoria de Terraform: no se borra ni se sube al repo.
- **User Pool** = el directorio de usuarios. **App Client** = una aplicación que puede usarlo, con sus propias reglas (flujos permitidos, URLs de regreso, duración de tokens).
- **Cliente público + PKCE:** lo que corre en el navegador no puede guardar secretos.
- **Credenciales temporales** (`aws login`) en vez de claves permanentes en tu PC.

**Siguiente paso (16):** crear el cliente OAuth en Google Cloud y registrar Google como proveedor en Cognito, también con Terraform.
