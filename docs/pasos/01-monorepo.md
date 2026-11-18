# Paso 1: esqueleto del monorepo

## Qué hicimos

Creamos la carpeta `charanatech` con un **monorepo pnpm**: un solo repositorio que contiene varias aplicaciones (`apps/web`, `apps/api`, `apps/workers`) y la infraestructura (`infra/`).

## Por qué un monorepo

- Un solo `git clone` y un solo `pnpm install` para todo el proyecto.
- La web, la API y los workers pueden compartir tipos y configuración sin publicar paquetes en npm.
- Un cambio que toca API y web va en un solo commit / pull request, más fácil de revisar.

## Por qué pnpm

- Guarda cada versión de cada paquete **una sola vez** en el disco y la enlaza en cada proyecto: instala más rápido y ocupa menos espacio que npm.
- Es estricto: un paquete solo puede importar lo que declara en su `package.json`. Eso evita errores de "en mi máquina funciona".
- Tiene soporte nativo de *workspaces* (`pnpm -r` ejecuta un script en todos los paquetes).

## Archivo por archivo

| Archivo | Para qué sirve |
|---|---|
| `package.json` | Raíz del monorepo. `private: true` evita publicarlo por error. `packageManager` fija pnpm 12.18.0 para que pnpm avise si alguien usa otra versión. `engines` exige Node 26. Los scripts (`build`, `test`, `lint`…) usan `pnpm -r`, que los corre en cada app que los tenga (`--if-present`). |
| `pnpm-workspace.yaml` | Le dice a pnpm que cada carpeta dentro de `apps/` es un paquete. `savePrefix: ""` guarda versiones exactas (`1.2.3` en vez de `^1.2.3`), como pide el plan. `engineStrict: true` falla si usas otra versión de Node. |
| `.nvmrc` | Versión de Node del proyecto (26.13.0, la LTS actual). `nvm use` o `fnm use` la leen automáticamente. |
| `tsconfig.base.json` | Configuración de TypeScript 7 compartida. Cada app la extiende con `"extends": "../../tsconfig.base.json"` y solo cambia lo suyo. `strict` y `noUncheckedIndexedAccess` atrapan más errores al compilar. |
| `.gitignore` | Qué no se sube a git: `node_modules`, builds, `.env` (secretos) y el estado de Terraform. |
| `.gitattributes` | Fuerza finales de línea LF. En Windows evita que git marque archivos como modificados solo por CRLF. |
| `.editorconfig` | Indentación de 2 espacios y UTF-8 en cualquier editor. |
| `.prettierrc.json` / `.prettierignore` | Formato automático del código, igual para todo el monorepo. |
| `apps/*/README.md`, `infra/README.md` | Marcadores que explican qué irá en cada carpeta y en qué fase. |

## Versiones fijadas

| Herramienta | Versión |
|---|---|
| Node | 26.13.0 |
| pnpm | 12.18.0 |
| TypeScript | 7.0.2 |
| @types/node | 26.6.6 |
| Prettier | 3.9.10 |

## Cómo probarlo en tu PC

```powershell
cd D:\Projects\charanatech
node -v              # debe decir v26.13.0
npm install -g pnpm@12.18.0   # Node 25+ ya no incluye Corepack
pnpm -v              # debe decir 12.18.0
pnpm install         # instala TypeScript y Prettier, crea pnpm-lock.yaml
pnpm format:check    # comprueba el formato
git init             # inicia el repositorio
```
