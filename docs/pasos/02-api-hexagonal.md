# Paso 2: API NestJS con arquitectura hexagonal + DDD

## Qué hicimos

Creamos `apps/api`, la API de **OrderHub**, con NestJS 12. Todavía no tiene productos ni pedidos: este paso deja lista la **estructura** y las piezas base que usarán Catalog (paso 3) y Orders (paso 4).

```
apps/api/
├─ src/
│  ├─ main.ts                    # arranca el servidor
│  ├─ app.module.ts              # módulo raíz de Nest
│  ├─ configure-app.ts           # prefijo /api y filtro de errores (lo usan main y los tests)
│  ├─ config/env.ts              # valida variables de entorno con Zod
│  ├─ shared/                    # "shared kernel": piezas que usan todos los módulos
│  │  ├─ domain/                 # Entity, ValueObject, AggregateRoot, DomainEvent, DomainError
│  │  ├─ application/            # interfaz UseCase
│  │  └─ infrastructure/http/    # HealthController y DomainErrorFilter
│  └─ modules/
│     ├─ catalog/{domain,application,infrastructure}/   # paso 3
│     └─ orders/{domain,application,infrastructure}/    # paso 4
└─ test/app.e2e-spec.ts          # test de punta a punta con HTTP real
```

## Arquitectura hexagonal en una frase

El **negocio** (dominio) va en el centro y no depende de nada. Todo lo "técnico" (HTTP, MySQL, DynamoDB, Cognito) son **adaptadores** que se conectan al centro a través de **puertos** (interfaces).

Las tres capas de cada módulo:

| Capa | Qué contiene | De qué puede depender |
|---|---|---|
| `domain/` | Reglas de negocio puras: entidades, objetos de valor, errores, eventos. Sin Nest, sin Prisma. | De nada |
| `application/` | Casos de uso ("crear pedido") y **puertos**: interfaces como `ProductRepository`. | Solo de `domain` |
| `infrastructure/` | **Adaptadores**: controladores HTTP, repositorios Prisma/DynamoDB, guard de Cognito. | De `application` y `domain` |

La regla de oro: **las flechas apuntan hacia adentro**. El dominio nunca importa nada de infraestructura. Así puedes cambiar MySQL por otra base de datos, o probar el negocio sin levantar nada, sin tocar las reglas.

## Piezas de DDD que creamos (`src/shared/domain`)

- **Entity**: tiene un `id` que no cambia. Dos entidades son iguales si tienen el mismo id y el mismo tipo. Ejemplo futuro: `Product`.
- **ValueObject**: se define por sus valores y es inmutable. Dos `Money(10, 'USD')` son iguales. Ejemplo futuro: `Money`, `Sku`, `Quantity`.
- **AggregateRoot**: una entidad que es la "puerta" de un grupo de objetos que cambian juntos (un `Order` con sus líneas). Además guarda **eventos de dominio** (`OrderPlaced`) que en la fase 3 se publicarán en EventBridge.
- **DomainError**: error de negocio con un `code` y un `kind` (`validation`, `not_found`, `conflict`). El dominio no sabe de HTTP.

## Cómo un error de negocio se vuelve HTTP

`DomainErrorFilter` es un adaptador: atrapa cualquier `DomainError` y lo traduce. `not_found` → 404, `conflict` → 409, `validation` → 400. Así el dominio solo dice "no existe" y la infraestructura decide cómo se comunica.

## Decisiones técnicas (y por qué)

- **ESM (`"type": "module"`)**: NestJS 12 se publica solo como módulos ES, así que nuestra API también. Por eso los imports terminan en `.js` aunque el archivo sea `.ts`: es lo que Node necesita al ejecutar el código compilado.
- **SWC compila, `tsc` solo revisa tipos**: TypeScript 7 (reescrito en Go, mucho más rápido) solo trae el comando `tsc`, sin la API programática que usan el Nest CLI o `ts-jest`. Por eso:
  - `pnpm build` usa **SWC** (compilador en Rust) para convertir `.ts` en `.js`.
  - `pnpm typecheck` usa **tsc 7** solo para revisar tipos (`--noEmit`).
  - No usamos el Nest CLI (lo probé y falla con TS 7).
- **`experimentalDecorators` + `emitDecoratorMetadata`**: Nest usa decoradores (`@Controller`, `@Injectable`) y la metadata de tipos para la inyección de dependencias.
- **Variables de entorno con Zod**: si `PORT` no es un número, la app no arranca y te dice por qué.
- **`configure-app.ts`**: la misma configuración en `main.ts` y en los tests e2e, para probar la app tal como corre de verdad.
- **Jest 30 + `@swc/jest`** con umbral de cobertura del **80%**, como pide el plan. Con ESM, Jest necesita `--experimental-vm-modules` (verás un aviso "ExperimentalWarning", es normal).

## Scripts de `apps/api`

| Script | Qué hace |
|---|---|
| `pnpm dev` | Compila y luego, en paralelo, recompila al guardar (`dev:compile`) y reinicia el servidor (`dev:server`, con `node --watch`). Lee `.env` si existe. |
| `pnpm build` | Compila `src/` a `dist/` con SWC. |
| `pnpm start` | Ejecuta `dist/main.js`. |
| `pnpm typecheck` | Revisa tipos con TypeScript 7. |
| `pnpm test` / `pnpm test:cov` | Tests (unitarios + e2e) / con reporte de cobertura. |

## Versiones fijadas

| Paquete | Versión |
|---|---|
| @nestjs/common, core, platform-express, testing | 12.4.2 |
| @nestjs/config | 12.1.1 |
| reflect-metadata | 0.2.2 |
| rxjs | 7.8.2 |
| zod | 4.6.7 |
| @swc/core / @swc/cli / @swc/jest | 1.16.22 / 0.8.2 / 0.2.39 |
| jest / @types/jest | 30.5.2 / 30.0.0 |
| supertest / @types/supertest | 7.3.2 / 7.2.1 |
| @types/express | 5.0.6 |

En `pnpm-workspace.yaml` agregamos `allowBuilds` para `@swc/core` y `@parcel/watcher`: pnpm bloquea por seguridad los scripts de instalación, y estos dos los necesitan para descargar su binario nativo.

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech
pnpm install
cd apps\api
pnpm typecheck      # sin errores
pnpm test:cov       # 11 tests, 100% de cobertura
pnpm dev            # abre http://localhost:3000/api/health → {"status":"ok"}
```

Yo lo verifiqué con Node 26.13.0: typecheck limpio, 11 tests pasando con 100% de cobertura, y `GET /api/health` respondiendo `{"status":"ok"}`.
