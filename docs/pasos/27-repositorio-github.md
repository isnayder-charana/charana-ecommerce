# Paso 27 (fase 4): el código sube a GitHub

## Qué hacemos

Hasta ahora CharanaTech vivía solo en tu PC. En este paso lo subimos a un **repositorio público** en GitHub, por tres razones:

1. **El reclutador lee el código.** El repositorio es tu portafolio: el README, la carpeta `docs/pasos` y el historial de commits muestran cómo trabajas.
2. **CI/CD lo necesita.** GitHub Actions (pasos 35 y 36) corre sobre el repositorio.
3. **OIDC lo necesita.** AWS confiará en "el repositorio `isnayder-charana/charana-ecommerce`", no en una llave guardada (paso 36).

La regla de oro de un repositorio público: **ningún secreto puede entrar ni una sola vez**. Aunque lo borres después, queda en el historial de git, y hay bots que escanean GitHub buscando llaves en minutos. Por eso la mitad de este paso es revisar antes de subir.

## 1. Crear el repositorio vacío

En <https://github.com/new>:

| Campo | Valor |
| --- | --- |
| Owner | `isnayder-charana` |
| Repository name | `charana-ecommerce` |
| Description | Tech accessories e-commerce: Next.js + hexagonal NestJS on AWS Lambda, Stripe and event-driven workflows |
| Visibility | **Public** |
| Add a README / .gitignore / license | **No** (los tres vacíos) |

Debe quedar vacío porque el README y el `.gitignore` ya los tienes en tu PC. Si GitHub crea los suyos, el primer `push` choca.

## 2. Completar el `.gitignore`

Abre `.gitignore` en la raíz del proyecto (`/d/Projects/charanatech/.gitignore`) y agrega al final las líneas que **no** estén ya:

```gitignore
# Terraform: variables con secretos (Google, Stripe, contraseña de RDS)
*.tfvars
!*.tfvars.example

# Vercel CLI (paso 34)
.vercel/

# Reportes de Playwright (fase 5)
playwright-report/
test-results/
```

Qué hace cada cosa:

- `*.tfvars` ignora `terraform.tfvars`, donde está el secreto de Google del paso 16. El `!` de la línea siguiente es una excepción: el `.example` sí se sube, para que otros sepan qué variables llenar.
- `.env` y `.env.*` ya estaban ignorados desde el paso 1, con la misma excepción para `.env.example`.
- `*.tfstate` también ya estaba: el estado de Terraform guarda IDs y a veces secretos en texto plano. En el paso 28 lo movemos a S3.

Lo que **sí** se sube aunque parezca raro: `.terraform.lock.hcl`. Es como el `pnpm-lock.yaml` de Terraform: fija la versión exacta del provider de AWS para que tu PC y GitHub Actions usen la misma.

## 3. Tu identidad en git (sin exponer tu correo)

Cada commit lleva un nombre y un correo, y en un repo público cualquiera los ve. GitHub te da un correo "noreply" que sigue contando los commits como tuyos:

Los comandos de esta guía son de **bash** (en Windows, abre **Git Bash**, que viene con Git):

```bash
cd /d/Projects/charanatech
git --version          # si no existe, instala Git for Windows: trae Git Bash
git config --global user.name "Isnayder"
git config --global user.email "134728698+isnayder-charana@users.noreply.github.com"
```

En la configuración de **tu cuenta** de GitHub (no la del repo): <https://github.com/settings/emails>. Ahí marca también **"Keep my email addresses private"** y **"Block command line pushes that expose my email"**.

## 4. Preparar el primer commit y revisarlo

```bash
git init -b main
git add .
```

`git add` todavía no sube nada: solo prepara. Ahora revisamos qué preparó.

**a) ¿Entró algún archivo de secretos?**

```bash
git status --short | grep -E '\.env|tfvars|tfstate|node_modules'
```

Solo deben salir archivos que terminan en `.example`. Si sale `apps/api/.env` o `terraform.tfvars`, **para** y avísame.

**b) ¿Por qué regla se ignora cada secreto?**

```bash
git check-ignore -v apps/api/.env apps/web/.env.local infra/terraform/terraform.tfvars
```

Cada línea muestra la regla del `.gitignore` que lo ignora. Si un archivo no sale, es que no está ignorado (o no existe en tu PC).

**c) ¿Hay alguna llave escrita dentro del código?**

```bash
git grep --cached -nE 'sk_(test|live)_[A-Za-z0-9]{10}|whsec_[A-Za-z0-9]{10}|GOCSPX-[A-Za-z0-9_-]{8}|AKIA[0-9A-Z]{16}'
```

Busca llaves de Stripe (`sk_test_`), el secreto del webhook (`whsec_`), el secreto de Google (`GOCSPX-`) y llaves de AWS (`AKIA`). Lo correcto es que **no imprima nada**. Los `.example` usan valores de mentira como `GOCSPX-...` que no coinciden con el patrón.

## 5. Commit y push

```bash
git commit -m "feat: CharanaTech store with hexagonal API, Stripe payments and events (phases 1-3)"
git remote add origin https://github.com/isnayder-charana/charana-ecommerce.git
git push -u origin main
```

La primera vez, Git Credential Manager abre el navegador para que inicies sesión en GitHub. No crees un token a mano.

> Los mensajes de commit van en inglés, con el formato *Conventional Commits* (`feat:`, `fix:`, `docs:`, `chore:`…): es el estándar que verás en casi cualquier equipo, y herramientas como release-please lo leen para generar changelogs.

> ¿Por qué un solo commit con tres fases? Porque el historial empezó hoy. Desde el paso 28 cada paso será un pull request propio, que es lo que un reclutador espera ver.

## 6. Protección de secretos en GitHub

En el repositorio: **Settings → Advanced Security** (puede llamarse "Code security") y verifica que estén activos:

- **Secret Protection / Secret scanning**: GitHub revisa cada commit buscando llaves conocidas.
- **Push protection**: si algún día intentas subir una llave de Stripe o AWS, GitHub **rechaza el push** antes de que sea pública.

En repositorios públicos son gratis. Es tu segunda red de seguridad, después del `.gitignore`.

En **About** (el engranaje a la derecha del repo) agrega los temas: `ecommerce`, `nextjs`, `nestjs`, `aws-lambda`, `terraform`, `hexagonal-architecture`, `ddd`, `stripe`.

## Cómo sé que funcionó

- `https://github.com/isnayder-charana/charana-ecommerce` muestra el README con el diagrama de la fase 3.
- En GitHub, buscar `.env` en el repo (tecla `t`) solo encuentra archivos `.env.example`.
- `git status` en tu PC dice `nothing to commit, working tree clean`.

## Para la entrevista

- "El repo es público, así que traté los secretos como si ya estuvieran expuestos: `.gitignore` con excepciones para los `.example`, una búsqueda de patrones de llaves antes del primer commit y push protection de GitHub como segunda barrera."
- "Commiteo `.terraform.lock.hcl` por la misma razón que el lockfile de pnpm: builds reproducibles entre mi PC y CI."
- "Uso el correo noreply de GitHub para no exponer mi correo en el historial."
