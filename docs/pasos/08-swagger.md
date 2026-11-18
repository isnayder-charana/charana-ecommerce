# Paso 8: documentación interactiva con Swagger

## Qué hicimos

La API ahora se documenta sola en **http://localhost:3000/api/docs**. Desde el navegador puedes ver cada ruta, qué datos espera y probarla sin Postman. El JSON OpenAPI está en `/api/docs-json`; Postman o Insomnia pueden importarlo directamente.

```
apps/api/src/
├─ configure-app.ts                                  # registra el pipe global y Swagger
└─ shared/infrastructure/
   ├─ http/swagger.ts                                # título, descripción y botón Authorize
   ├─ http/schema-validation.pipe.ts                 # reemplaza a zod-validation.pipe.ts
   └─ auth/auth.decorators.ts                        # @Public y @AdminOnly también informan a Swagger
```

## Una sola fuente de verdad: el esquema Zod

Antes cada parámetro creaba su propio pipe:

```ts
@Body(new ZodValidationPipe(placeOrderBodySchema)) body
```

NestJS 12 permite declarar el esquema **dentro del decorador**:

```ts
@Body({ schema: placeOrderBodySchema }) body
```

Ese esquema queda guardado en la metadata del parámetro, y dos piezas lo leen:

1. **`SchemaValidationPipe`** (global) valida y transforma la entrada. Si falla, responde el mismo 400 de antes con `code: "VALIDATION_FAILED"` y la lista de errores.
2. **`@nestjs/swagger`** lo convierte a JSON Schema para documentar el body, los parámetros y el query.

Así la documentación **no puede desactualizarse**: si cambias una regla en el esquema Zod, cambian la validación y la documentación a la vez. Sin esto habría que escribir clases DTO con `@ApiProperty()` repetidas a mano.

El pipe no depende de Zod: usa **Standard Schema**, una interfaz común que implementan Zod, Valibot y ArkType. Si un día cambiaras de librería, el pipe seguiría funcionando.

Los ejemplos que ves en Swagger (por ejemplo, el `productId` de los audífonos) salen de `.meta({ examples: [...] })` en el esquema.

## Autenticación en Swagger

- Toda ruta pide token por defecto (`addSecurityRequirements('bearer')`), igual que los guards globales de la API: **seguro por defecto también en la documentación**.
- `@Public()` ahora también marca la ruta sin candado en Swagger.
- `@AdminOnly()` documenta la respuesta 403.
- Pulsa **Authorize**, pega `dev:ana` (cliente) o `dev:ana:admin` (admin) y listo. Con Cognito real pegarías el *access token*. `persistAuthorization` hace que el token se recuerde al recargar la página.

### ¿Y el usuario y la contraseña?

La API **nunca recibe contraseñas**. El flujo real es:

1. El usuario inicia sesión **en Cognito** (en la fase 2, desde la tienda con Amplify).
2. Cognito devuelve un *access token* (JWT, dura 1 hora) y un *refresh token*.
3. El frontend guarda los tokens (Amplify lo hace solo) y envía `Authorization: Bearer <token>` en cada petición.
4. La API solo verifica la firma del token con las llaves públicas de Cognito.

Así la API no guarda contraseñas ni maneja sesiones, y un fallo en la API no puede filtrarlas.

## Versiones fijadas

| Paquete | Versión |
|---|---|
| @nestjs/swagger | 12.1.1 |

`@nestjs/swagger` instala `@scarf/scarf`, un paquete de telemetría que quiere ejecutar un script al instalarse. Lo bloqueamos explícitamente en `pnpm-workspace.yaml` (`'@scarf/scarf': false`).

## Tests

113 tests. Hay 3 nuevos en `test/docs.e2e-spec.ts`: comprueban que Swagger UI responde, que las rutas públicas no piden token y las demás sí, y que el body y el query se documentan a partir de los esquemas.

## Cómo probarlo

```powershell
cd D:\Projects\charanatech
pnpm install
cd apps\api
pnpm dev
```

Abre http://localhost:3000/api/docs, pulsa **Authorize**, escribe `dev:ana` y prueba `POST /api/orders` con **Try it out** → **Execute**. El body de ejemplo ya trae un producto válido.
