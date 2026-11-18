# Paso 7 (parte 1): servicios locales con docker compose

## Qué hicimos

Un archivo, `compose.yaml`, levanta en tu PC las mismas piezas que usaremos en AWS:

| Servicio | Imagen (versión fija) | Puerto | En AWS será | Para qué |
|---|---|---|---|---|
| `mysql` | `mysql:8.4.13` | 3306 | RDS MySQL 8.4 | Catálogo y stock (parte 2: Prisma) |
| `dynamodb` | `amazon/dynamodb-local:3.3.2` | 8000 | DynamoDB | Carrito y pedidos (parte 3) |
| `localstack` | `localstack/localstack:2026.10.6` | 4566 | S3, SQS, SNS, EventBridge, SES | Imágenes y eventos (fase 3) |
| `opensearch` | `opensearchproject/opensearch:3.9.0` | 9200 | OpenSearch | Búsqueda avanzada (fase 5) |

Elegimos **MySQL 8.4** porque es la versión LTS que ofrece RDS. Así, lo que funciona en local funciona igual en AWS.

## Perfiles: no levantar todo siempre

OpenSearch pide ~1 GB de RAM y LocalStack necesita un token, así que no arrancan por defecto. Se activan con **perfiles**:

```powershell
docker compose up -d --wait                               # MySQL + DynamoDB
docker compose --profile aws up -d --wait                 # + LocalStack
docker compose --profile search up -d --wait              # + OpenSearch
docker compose --profile aws --profile search up -d       # todo
docker compose down                                       # apagar (los datos se conservan)
docker compose down -v                                    # apagar y BORRAR los datos
```

Atajos desde la raíz: `pnpm infra:up` y `pnpm infra:down`.

`--wait` espera a que cada servicio esté **sano** (healthcheck) antes de devolverte la terminal. Así nunca intentas conectar a un MySQL que todavía está arrancando.

## Piezas importantes del archivo

- **Volúmenes con nombre** (`mysql-data`, `dynamodb-data`…): los datos sobreviven a `docker compose down`. Solo `down -v` los borra.
- **Healthchecks**: MySQL con `mysqladmin ping`, OpenSearch y LocalStack con `curl`. La imagen de DynamoDB Local no trae `curl`, así que usamos un truco de bash: `exec 3<>/dev/tcp/127.0.0.1/8000` intenta abrir el puerto.
- **Variables con valor por defecto**: `${MYSQL_PORT:-3306}` usa 3306 salvo que pongas otro valor en `.env`. Útil si ya tienes MySQL instalado en Windows ocupando ese puerto.
- **`infra/local/mysql/01-test-database.sql`**: MySQL lo ejecuta la primera vez y crea `charanatech_test`, una base separada para los tests de integración.
- **`infra/local/localstack/01-create-resources.sh`**: LocalStack lo ejecuta al arrancar y crea el bucket de imágenes, el bus de EventBridge, el tema SNS, la cola SQS con su *dead-letter queue* y el remitente de SES. Usa los mismos nombres que creará Terraform en la fase 4.
- **OpenSearch sin seguridad** (`DISABLE_SECURITY_PLUGIN`): solo en local, para no gestionar certificados. En AWS será un dominio con acceso restringido.

## LocalStack ahora pide un token

Al probarlo, la imagen actual de LocalStack se detuvo con *"License activation failed… set LOCALSTACK_AUTH_TOKEN"*. Desde 2026 LocalStack exige una cuenta, aunque sea la gratuita. Por eso:

1. Está en el perfil `aws`: `docker compose up` funciona sin cuenta.
2. Cuando lleguemos a la fase 3 (eventos), creas una cuenta gratuita en [app.localstack.cloud](https://app.localstack.cloud), copias `.env.example` como `.env` y pegas el token en `LOCALSTACK_AUTH_TOKEN`.

El archivo `.env` está en `.gitignore`, así que el token nunca se sube a GitHub.

## Lo que probé

En un entorno Linux con Docker 29:

- `pnpm infra:up` → `mysql` y `dynamodb` en estado **healthy**.
- MySQL: existen las bases `charanatech` y `charanatech_test`.
- DynamoDB Local: responde `ListTables` → `{"TableNames":[]}`.
- OpenSearch (perfil `search`): **healthy**, versión 3.9.0.
- LocalStack: sin token se detiene con el mensaje de licencia. **El script de creación de recursos no lo pude probar** sin token; lo verificaremos en la fase 3.

## Cómo probarlo en tu PC

Necesitas **Docker Desktop** abierto.

```powershell
cd D:\Projects\charanatech
pnpm infra:up
docker compose ps

# Entrar a MySQL
docker compose exec mysql mysql -ucharanatech -pcharanatech charanatech

pnpm infra:down
```

## Siguiente

- **Parte 2:** adaptador **Prisma + MySQL** para Catalog. Reemplaza al repositorio en memoria; búsqueda con `FULLTEXT`; reserva de stock dentro de una transacción.
- **Parte 3:** adaptador **DynamoDB** para Orders, con el diseño de la tabla (claves de partición por cliente).

## Actualización: encendido automático

MySQL y DynamoDB tienen `restart: unless-stopped`. Desde que los enciendes una vez con `pnpm infra:up`, vuelven a encenderse solos cada vez que abres Docker Desktop. Si los apagas con `pnpm infra:down`, se quedan apagados hasta el próximo `infra:up`.

LocalStack y OpenSearch no lo tienen a propósito: son pesados (OpenSearch usa ~1 GB de RAM) y solo se usan en algunos pasos.
