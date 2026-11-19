# Paso 29 (fase 4): los datos se mudan a AWS (RDS, DynamoDB y SSM)

## Qué hacemos

Hasta ahora MySQL y DynamoDB corrían en Docker en tu PC (`compose.yaml`). En este paso creamos sus versiones reales en AWS con Terraform, más un lugar seguro para los secretos:

| En tu PC (compose.yaml) | En AWS (este paso) | Archivo |
| --- | --- | --- |
| MySQL 8.4 en Docker | **RDS MySQL 8.4** (`db.t4g.micro`, 20 GB) | `infra/terraform/database.tf` |
| DynamoDB Local | Tabla **DynamoDB** `charanatech` | `infra/terraform/dynamodb.tf` |
| Valores en `apps/api/.env` | **SSM Parameter Store** (`/charanatech/prod/...`) | `infra/terraform/ssm.tf` |

La API todavía no usa nada de esto: eso llega en el paso 30, cuando corra en Lambda. Hoy solo creamos los recursos y comprobamos que funcionan.

## RDS: MySQL administrado por AWS

RDS es MySQL sin tener que mantener un servidor: AWS se encarga de los parches, las copias de seguridad y el disco.

### La decisión: IP pública con TLS (y no una VPC privada)

Lo "de manual" es poner la base en una subred privada, sin acceso desde internet. Pero entonces las Lambdas también tendrían que estar en esa red, y para llegar a Stripe y EventBridge necesitarían un **NAT Gateway**, que cuesta unos USD 32 al mes. Eso se come tus créditos en 4 meses.

Así que la base tiene IP pública, con tres barreras:

1. **Firewall (security group):** solo deja entrar al puerto 3306 desde las IPs de `db_allowed_cidrs`. Hoy es **solo tu IP**. En el paso 30 lo abriremos para las Lambdas, que no tienen IP fija.
2. **TLS obligatorio:** el parámetro `require_secure_transport = 1` hace que MySQL rechace cualquier conexión sin cifrar. Lo vas a comprobar tú mismo.
3. **Contraseña larga y aleatoria:** 40 caracteres generados con `openssl` (RDS para MySQL acepta como máximo 41).

En una entrevista: *"En producción real iría en subred privada con VPC endpoints. Aquí prioricé el costo y lo compensé con TLS obligatorio, firewall y una contraseña aleatoria."*

### Otras protecciones de `database.tf`

| Ajuste | Qué hace |
| --- | --- |
| `storage_encrypted = true` | El disco está cifrado |
| `backup_retention_period = 1` | Copia automática diaria |
| `deletion_protection = true` | AWS no deja borrar la base, ni siquiera con `terraform destroy` |
| `skip_final_snapshot = false` | Si algún día la borras, antes guarda una copia final |

### Contraseñas que no quedan en el estado

Antes, cualquier contraseña que pasaba por Terraform quedaba escrita en `terraform.tfstate`. Ahora usamos dos novedades de Terraform:

- **Variables `ephemeral`** (`db_password`, `internal_api_key`, `stripe_secret_key`): Terraform las usa durante el `plan`/`apply` y no las guarda en ningún lado.
- **Argumentos write-only** (`password_wo`, `value_wo`): el valor viaja a AWS, pero el estado solo guarda un número de versión (`secrets_version`).

Para cambiar un secreto: pones el valor nuevo en `terraform.tfvars`, subes `secrets_version` a 2 y haces `apply`.

## DynamoDB: la misma tabla que en tu PC

`dynamodb.tf` crea exactamente la tabla que `pnpm db:tables` crea en DynamoDB Local: claves `PK`/`SK` y el índice `GSI1` (los pedidos de un cliente). Además:

- **TTL en `expiresAt`:** los eventos procesados (webhooks de Stripe y workers) se borran solos cuando vencen.
- **Stream (`NEW_IMAGE`):** cada escritura queda 24 horas en un "stream". En el paso 31 una Lambda lo leerá para publicar los eventos del outbox, en lugar del `setInterval` de hoy.
- **Point-in-time recovery:** puedes restaurar la tabla a cualquier segundo de los últimos 35 días.
- **`deletion_protection_enabled`:** igual que RDS, no se puede borrar por accidente.

## SSM Parameter Store: los secretos de producción

Las Lambdas no tendrán un `.env`. Leerán sus secretos de SSM al arrancar:

| Parámetro | Qué guarda |
| --- | --- |
| `/charanatech/prod/database-url` | La `DATABASE_URL` de RDS, armada por Terraform |
| `/charanatech/prod/internal-api-key` | La clave compartida entre la API y los workers |
| `/charanatech/prod/stripe-secret-key` | Tu `sk_test_...` |

Son `SecureString`: van cifrados con la llave de AWS para SSM. Usamos Parameter Store y no Secrets Manager porque los parámetros estándar son gratis, y Secrets Manager cobra unos USD 0.40 por secreto al mes.

## Costo (aproximado)

Tu cuenta usa el plan nuevo de AWS: no tiene las "750 horas gratis de RDS" de antes, sino créditos (USD 120). Estimación mensual si RDS queda encendido todo el mes:

| Recurso | Aprox. al mes |
| --- | --- |
| RDS `db.t4g.micro` | USD 12 |
| Disco gp3 de 20 GB | USD 2.3 |
| IPv4 pública de RDS | USD 3.6 |
| DynamoDB, SSM, backups | Centavos |
| **Total** | **≈ USD 18** |

Son estimaciones mías, sin el precio exacto de hoy: confírmalas en [precios de RDS para MySQL](https://aws.amazon.com/rds/mysql/pricing/) y [cargo por IPv4 pública](https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights). Tu límite de gasto sigue activo, así que no puedes pasarte de los créditos.

**Para ahorrar:** cuando no estés trabajando ni mostrando la tienda, apaga RDS. Apagada solo cobra el disco y la IPv4:

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
aws rds start-db-instance --db-instance-identifier charanatech --profile charanatech
```

AWS la vuelve a encender sola a los 7 días si la dejas apagada.

## Hazlo en tu PC

Todo en **Git Bash**, en `main` después de hacer merge de este PR.

### 1. Traer los cambios

```bash
cd /d/Projects/charanatech
git switch main
git pull
aws login --profile charanatech
```

### 2. Llenar los secretos en `terraform.tfvars`

Mira tu IP pública:

```bash
curl -s https://checkip.amazonaws.com
```

Genera la contraseña de MySQL:

```bash
openssl rand -hex 20
```

Son 40 caracteres. No uses más: la contraseña maestra de RDS para MySQL admite como máximo 41, y con más el `apply` falla con *"is not a valid password because it is longer than 41 characters"*.

Abre `infra/terraform/terraform.tfvars` (el que ya tiene lo de Google) y agrega al final, con tus valores:

```hcl
db_allowed_cidrs  = ["TU.IP.PUBLICA/32"]
db_password       = "lo-que-imprimió-openssl"
internal_api_key  = "la-misma-INTERNAL_API_KEY-de-apps/api/.env"
stripe_secret_key = "la-misma-STRIPE_SECRET_KEY-de-apps/api/.env"
```

Guarda también `db_password` en tu gestor de contraseñas: Terraform no la guarda en ningún lado.

> Tu IP de casa puede cambiar (pasa con muchos proveedores en Perú). Si un día no puedes conectarte, revisa tu IP, cámbiala en `db_allowed_cidrs` y haz `apply`.

### 3. Revisar el plan

```bash
cd infra/terraform
terraform plan
```

Debe terminar en **`Plan: 8 to add, 0 to change, 0 to destroy`**:

- `aws_security_group.db` y `aws_vpc_security_group_ingress_rule.db_mysql[...]`
- `aws_db_parameter_group.mysql` y `aws_db_instance.main`
- `aws_dynamodb_table.main`
- los 3 `aws_ssm_parameter`

Fíjate que donde va la contraseña el plan muestra `(write-only attribute)`, no el valor. Si dice algo distinto de 8 to add, o quiere cambiar algo de Cognito, para y pégamelo.

### 4. Aplicar

```bash
terraform apply
```

Escribe `yes` **solo** (sin pegar otro comando después). RDS tarda entre 5 y 10 minutos en crearse: es normal que se quede en `Still creating...`.

Al terminar:

```bash
terraform output
```

### 5. Comprobar MySQL con TLS

Descarga el certificado de AWS que firma los servidores de RDS en `us-east-2`:

```bash
cd ~
curl -sSo rds-ca.pem https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem
```

Conéctate con el cliente de MySQL de Docker (no hace falta instalar nada). Cambia `TU_DB_HOST` por el `db_host` del output; te pedirá la contraseña:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -it -v "$(pwd -W)/rds-ca.pem:/rds-ca.pem:ro" mysql:8.4.13 \
  mysql --host=TU_DB_HOST --user=charanatech --password \
  --ssl-mode=VERIFY_IDENTITY --ssl-ca=/rds-ca.pem charanatech \
  -e "SELECT VERSION(); SHOW STATUS LIKE 'Ssl_version';"
```

Debe mostrar la versión `8.4.x` y `Ssl_version | TLSv1.3` (o 1.2). `VERIFY_IDENTITY` comprueba que el servidor es de verdad tu RDS, y no solo que la conexión va cifrada.

> `MSYS_NO_PATHCONV=1` evita que Git Bash convierta `/rds-ca.pem` en una ruta de Windows. `$(pwd -W)` da la carpeta actual en formato Windows, que es lo que entiende Docker Desktop.

Ahora prueba lo contrario, **sin** TLS:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -it mysql:8.4.13 \
  mysql --host=TU_DB_HOST --user=charanatech --password --ssl-mode=DISABLED charanatech
```

Debe fallar con *"Connections using insecure transport are prohibited while --require_secure_transport=ON"*. Esa es la barrera 2 funcionando.

### 6. Comprobar DynamoDB y SSM

```bash
aws dynamodb describe-table --table-name charanatech --profile charanatech \
  --query "Table.{estado:TableStatus,indices:GlobalSecondaryIndexes[].IndexName,stream:StreamSpecification}"
aws dynamodb describe-time-to-live --table-name charanatech --profile charanatech
aws ssm get-parameters-by-path --path /charanatech/prod --profile charanatech \
  --query "Parameters[].{nombre:Name,tipo:Type}"
```

Debe salir: la tabla `ACTIVE` con `GSI1` y el stream `NEW_IMAGE`, el TTL `ENABLED` sobre `expiresAt`, y los 3 parámetros como `SecureString`. Sin `--with-decryption` no se ve el valor, y así está bien.

### 7. (Opcional) Apagar RDS hasta el paso 30

```bash
aws rds stop-db-instance --db-instance-identifier charanatech --profile charanatech
```

## Cómo sé que funcionó

- `terraform plan` vuelve a decir **No changes**.
- La conexión con `VERIFY_IDENTITY` funciona y la de `DISABLED` es rechazada.
- La tabla está `ACTIVE`, con TTL y stream.
- Los 3 parámetros existen en SSM.

## Lo que queda para el paso 30

- Crear las tablas de MySQL en RDS (`prisma migrate deploy`) y cargar los productos (`pnpm db:seed`). Para eso la API tiene que aprender a conectarse con TLS verificando el certificado de RDS, y eso es código: va junto con la API en Lambda.
- Abrir el firewall de RDS para las Lambdas.

## Para la entrevista

- "La base de datos está en RDS con TLS obligatorio (`require_secure_transport`), disco cifrado, backups y protección contra borrado. No está en subred privada para evitar el NAT Gateway; lo compensé con un security group restringido y verificación del certificado (`VERIFY_IDENTITY`)."
- "Los secretos no pasan por el estado de Terraform: uso variables `ephemeral` y argumentos write-only (`password_wo`, `value_wo`), y los roto subiendo una versión."
- "Los secretos de producción viven en SSM Parameter Store como SecureString. Elegí Parameter Store sobre Secrets Manager porque no necesito rotación automática y es gratis."
- "La tabla de DynamoDB que crea Terraform es la misma que creo en local con el SDK: claves genéricas para single-table design, TTL para los eventos procesados y un stream preparado para el outbox."
