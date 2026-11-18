# Paso 6: calidad (linter, reglas de arquitectura y un solo comando)

## Qué hicimos

Los tests ya los fuimos escribiendo en cada paso. Este paso agrega lo que falta para que la calidad **no dependa de acordarse**:

1. Un **linter** (Biome) que revisa todo el monorepo.
2. **Reglas de arquitectura**: el linter **falla** si alguien rompe las capas hexagonales.
3. Un solo comando, **`pnpm check`**, que corre todo. Es lo que ejecutará GitHub Actions en la fase 4.

## ¿Por qué Biome y no ESLint?

Lo normal sería ESLint con `typescript-eslint`. Pero `typescript-eslint` usa la API interna de TypeScript, y **TypeScript 7 todavía no la trae** (es el mismo problema que tuvimos con el Nest CLI en el paso 2). Hoy `typescript-eslint` solo soporta TypeScript hasta la 6.0.

**Biome** está escrito en Rust y trae su propio analizador de TypeScript, así que no depende de esa API. Además es muy rápido: revisa los 91 archivos en ~25 ms. Solo lo usamos como **linter**; el formato sigue a cargo de Prettier.

Cuando TypeScript 7.1 traiga de vuelta la API, se podría volver a ESLint si hiciera falta.

## Las reglas de arquitectura

En `biome.json` hay dos `overrides` con la regla `noRestrictedImports`:

| Carpeta | No puede importar | Por qué |
|---|---|---|
| `**/domain/**` | `@nestjs/*`, `zod`, `express`, `aws-jwt-verify`, `application/`, `infrastructure/` | El dominio es negocio puro: no conoce frameworks ni capas exteriores. |
| `**/application/**` | `@nestjs/*`, `express`, `aws-jwt-verify`, `infrastructure/` | Los casos de uso hablan con **puertos** (interfaces), nunca con adaptadores concretos. |

Los archivos `*.spec.ts` están excluidos: en un test sí es válido armar un caso de uso con el repositorio en memoria.

Lo probé rompiendo las reglas a propósito, y Biome responde así:

```
domain/sku.ts:1:28 lint/style/noRestrictedImports
  × El dominio no depende de frameworks ni librerías de infraestructura.
application/get-order.use-case.ts:1:41 lint/style/noRestrictedImports
  × La aplicación no puede importar adaptadores: define un puerto (interfaz) y que infrastructure lo implemente.
```

Así, la arquitectura hexagonal deja de ser "una convención que hay que recordar" y pasa a ser **una regla que el CI hace cumplir**. Esto es algo muy bueno para mostrar en una entrevista.

## Lo que el linter encontró (y arreglamos)

- `if (!order || !order.isOwnedBy(id))` → `if (!order?.isOwnedBy(id))` (*optional chaining*).
- Quitamos los `!` (*non-null assertions*) del código de producción. El `!` le dice a TypeScript "confía en mí, esto no es null", y si te equivocas el error aparece en producción. Ahora:
  - `@CustomerId()` responde **401** si por error no hubiera usuario, en vez de romperse.
  - `DevTokenVerifier` valida el resultado del regex de forma explícita.
- En los tests sí permitimos `!`, porque ahí un error es justo lo que queremos ver.

## Cobertura

Agregamos `auth.module.spec.ts`, que comprueba que `AUTH_MODE` elige el adaptador correcto (`dev` → `DevTokenVerifier`, `cognito` → `CognitoTokenVerifier`).

| Métrica | Mínimo exigido | Actual |
|---|---|---|
| Líneas | 80% | 100% |
| Funciones | 80% | 100% |
| Sentencias | 80% | 99.7% |
| Ramas | 80% | 93.8% |

Las ramas "no cubiertas" que quedan son, en su mayoría, código que genera el compilador para los decoradores, no lógica nuestra.

**93 tests** en total:

| Tipo | Qué prueba | Ejemplo |
|---|---|---|
| Unitarios de dominio | Reglas de negocio puras | `order.spec.ts`: no se puede enviar un pedido sin pagar |
| Casos de uso | La orquestación, con adaptadores en memoria | `orders.use-cases.spec.ts`: la reserva de stock es todo o nada |
| Adaptadores | Integración con librerías | `cognito-token.verifier.spec.ts`: rechaza tokens firmados con otra llave |
| e2e | La API completa por HTTP | `orders.e2e-spec.ts`: comprar → pagar → enviar → entregar |

## Scripts de la raíz

| Script | Qué hace |
|---|---|
| `pnpm lint` | Biome en todo el monorepo |
| `pnpm format` / `pnpm format:check` | Prettier: arreglar / solo revisar |
| `pnpm typecheck` | TypeScript 7 en cada app |
| `pnpm test` / `pnpm test:cov` | Tests / con cobertura |
| **`pnpm check`** | **Todo lo anterior en orden. Si algo falla, se detiene.** |

## Editor

Instala en VS Code la extensión **Biome** (`biomejs.biome`): verás los errores de arquitectura subrayados mientras escribes.

## Versión fijada

| Paquete | Versión |
|---|---|
| @biomejs/biome | 2.6.6 |

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech
pnpm install
pnpm check
```

Para ver la regla en acción, agrega `import { Injectable } from '@nestjs/common';` al inicio de `apps/api/src/modules/catalog/domain/sku.ts` y corre `pnpm lint`. Después bórralo.
