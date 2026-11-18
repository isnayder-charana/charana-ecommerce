# Paso 5: autenticación con JWT de Cognito

## Qué hicimos

La API ya sabe **quién** hace cada petición y **qué puede hacer**:

- El catálogo y `/health` son **públicos**.
- Comprar y ver tus pedidos exige estar **autenticado** (token de Cognito).
- Crear productos y cambiar el estado de un pedido es **solo para administradores** (grupo `admin` de Cognito).

Desaparece la cabecera temporal `x-customer-id`: ahora el cliente es el usuario del token.

## Cómo funciona un JWT de Cognito (en 30 segundos)

1. El usuario inicia sesión en el frontend (fase 2, con Amplify). Cognito le entrega un **access token**: un JWT.
2. Un JWT tiene tres partes separadas por puntos: `cabecera.datos.firma`. Los datos (`payload`) incluyen `sub` (id del usuario), `cognito:groups`, `client_id` y `exp` (vencimiento).
3. Cognito **firma** el token con su llave privada. Cualquiera puede comprobar la firma con la llave **pública**, que Cognito publica en una URL (JWKS).
4. El frontend envía el token en cada petición: `Authorization: Bearer eyJ...`.
5. La API verifica la firma y los datos. Si alguien modifica un solo carácter, la firma deja de coincidir y el token se rechaza.

La API **nunca** habla con Cognito para validar cada petición: solo descarga las llaves públicas una vez y las guarda en caché. Por eso es rápido y barato.

## Arquitectura: otro puerto con dos adaptadores

```
src/shared/infrastructure/auth/
├─ token-verifier.ts          # PUERTO: verify(token) → AuthUser
├─ cognito-token.verifier.ts  # ADAPTADOR real (aws-jwt-verify)
├─ dev-token.verifier.ts      # ADAPTADOR de desarrollo local
├─ jwt-auth.guard.ts          # guard global: ¿quién eres? → 401
├─ admin.guard.ts             # guard global: ¿eres admin? → 403
├─ auth.decorators.ts         # @Public() y @AdminOnly()
├─ auth-user.ts               # tipo AuthUser { id, username, groups }
└─ auth.module.ts             # elige el adaptador según AUTH_MODE
```

### `CognitoTokenVerifier`
Usa **`aws-jwt-verify`**, la librería oficial de AWS, sin dependencias. Comprueba:
- la **firma** RS256 con las llaves públicas del user pool;
- que no esté **vencido** (`exp`);
- el **emisor** (`iss`): que venga de *nuestro* user pool;
- que sea un **access token** (no un id token);
- que el `client_id` sea el de *nuestra* app.

Usamos el **access token** y no el id token porque es el que está pensado para autorizar llamadas a una API.

### `DevTokenVerifier`
Para desarrollar sin crear nada en AWS: acepta tokens como `dev:isnayder` (cliente) o `dev:jefe:admin` (administrador). Es inseguro a propósito, así que `env.ts` **impide usarlo en producción**: si `NODE_ENV=production` y `AUTH_MODE=dev`, la API no arranca.

## Los guards: "seguro por defecto"

En Nest, un **guard** decide si una petición puede llegar al controlador. Registramos dos como **globales** (`APP_GUARD`), así que se aplican a **todas** las rutas:

1. **`JwtAuthGuard`** lee `Authorization: Bearer <token>`, lo verifica y guarda el usuario en `request.user`. Si falla → **401 Unauthorized**. Las rutas con `@Public()` se saltan este paso.
2. **`AdminGuard`**: en las rutas con `@AdminOnly()` exige el grupo `admin`. Si no → **403 Forbidden**.

¿Por qué globales? Si mañana alguien agrega un endpoint y olvida el decorador, queda **protegido**, no expuesto. Es mejor equivocarse hacia el lado seguro.

**401 vs 403:** 401 = "no sé quién eres" (falta el token o no es válido). 403 = "sé quién eres, pero no tienes permiso".

El mensaje de error no dice *por qué* falló el token (vencido, mal firmado…). Así no le damos pistas a quien intenta falsificarlo.

## Qué cambió en los módulos

| Ruta | Antes | Ahora |
|---|---|---|
| `GET /api/health`, `GET /api/products`, `GET /api/products/:id` | abierta | `@Public()` |
| `POST /api/products` | abierta | `@AdminOnly()` |
| `/api/orders` (comprar, listar, ver, cancelar) | cabecera `x-customer-id` | token obligatorio |
| `PATCH /api/orders/:id/status` | abierta | `@AdminOnly()` |

El decorador `@CustomerId()` de Orders ahora lee `request.user.id` (el `sub` del token) en vez de la cabecera. **Los casos de uso no cambiaron ni una línea.** Esa es la ventaja de que el dominio no sepa nada de HTTP ni de tokens.

## Variables de entorno nuevas

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `AUTH_MODE` | `dev` en local, `cognito` en producción | Qué adaptador usar |
| `COGNITO_USER_POOL_ID` | (obligatoria con `cognito`) | p. ej. `us-east-1_AbCdEf123` |
| `COGNITO_CLIENT_ID` | (obligatoria con `cognito`) | El app client del frontend |
| `COGNITO_ADMIN_GROUP` | `admin` | Nombre del grupo de administradores |

El user pool real lo crearemos con Terraform en la fase 4. Cognito es gratis hasta 10 000 usuarios activos al mes.

## Tests: Cognito de mentira, verificación de verdad

`test/support/cognito-tokens.ts` **simula un user pool**: genera un par de llaves RSA, publica la pública como JWKS y firma tokens con la privada. Los tests usan el `CognitoTokenVerifier` **real** con esas llaves, sin conectarse a AWS.

- `cognito-token.verifier.spec.ts`: acepta un token válido y rechaza tokens vencidos, de otra app, id tokens y tokens firmados con otra llave.
- `test/auth.e2e-spec.ts`: rutas públicas, 401 sin token o con uno inválido, 403 para un cliente en rutas de admin y 201 para un admin.
- Los e2e de Catalog y Orders ahora envían tokens firmados (helpers `customerToken()` y `adminToken()`).

Resultado: **91 tests**, 99% de líneas cubiertas.

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech
pnpm install            # instala aws-jwt-verify 5.2.1
cd apps\api
pnpm test:cov
pnpm dev
```

En otra terminal:

```powershell
# Sin token → 401
curl.exe -i http://localhost:3000/api/orders

# Comprar como cliente
curl.exe -X POST http://localhost:3000/api/orders -H "Authorization: Bearer dev:isnayder" -H "Content-Type: application/json" -d '{\"items\":[{\"productId\":\"7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1001\",\"quantity\":1}]}'

# Un cliente intenta marcar el pedido como pagado → 403
curl.exe -i -X PATCH http://localhost:3000/api/orders/<id>/status -H "Authorization: Bearer dev:isnayder" -H "Content-Type: application/json" -d '{\"action\":\"pay\"}'

# Un admin sí puede → 200
curl.exe -X PATCH http://localhost:3000/api/orders/<id>/status -H "Authorization: Bearer dev:jefe:admin" -H "Content-Type: application/json" -d '{\"action\":\"pay\"}'
```

## Versión fijada

| Paquete | Versión |
|---|---|
| aws-jwt-verify | 5.2.1 |
