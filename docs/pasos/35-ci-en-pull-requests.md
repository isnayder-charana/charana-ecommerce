# Paso 35 (fase 4): cada pull request se revisa solo (CI)

## Qué hacemos

Hasta ahora, antes de abrir cada pull request, yo corría a mano el formato, el lint, los tipos y los tests. Desde este paso lo hace **GitHub Actions** en cada pull request y en cada push a `main`. Es la **integración continua** (*CI*, *Continuous Integration*).

```
pull request ──▶ GitHub Actions
                  ├─ Formato, lint, tipos y tests          (las 3 apps, cobertura ≥ 80 %, build de la tienda)
                  ├─ Tests de integración (MySQL y DynamoDB) (contra contenedores de verdad)
                  ├─ Terraform (formato y validación)
                  └─ Imágenes Docker (API y workers)
                       │
                       ▼
               los 4 en verde ──▶ se puede fusionar
```

Además, una **regla en GitHub** hace que `main` solo acepte cambios por pull request y con los 4 checks en verde.

```
.github/workflows/ci.yml           # NUEVO: el workflow
README.md                          # insignia "CI passing" arriba del todo
docs/pasos/34-tienda-en-vercel.md  # corrección: el paso 4 usaba un output antes de crearlo
```

## Las decisiones, una por una

### 1. Cuatro trabajos en paralelo

Cada trabajo (*job*) corre en su propia máquina de GitHub, al mismo tiempo que los demás. El total tarda lo que tarde el más lento (unos 3 a 5 minutos), no la suma.

| Trabajo | Qué revisa | Por qué aparte |
| --- | --- | --- |
| **Formato, lint, tipos y tests** | `pnpm format:check`, `lint`, `typecheck`, `test:cov` y el build de Next.js | Es lo mismo que `pnpm check` en tu PC, más el build de la tienda |
| **Tests de integración** | Los repositorios contra MySQL 8.4 y DynamoDB Local reales | Necesita contenedores; si falla, se sabe que el problema es de base de datos |
| **Terraform** | `fmt -check` y `validate` | Encuentra errores de sintaxis o referencias rotas sin tocar AWS |
| **Imágenes Docker** | Que los `Dockerfile` de la API y los workers compilen | Si una imagen no compila, el despliegue del paso 36 fallaría |

Los nombres de los trabajos son los que verás en el pull request, y los que la regla de `main` exige.

### 2. Los tests de integración usan contenedores de servicio

En tu PC, `pnpm infra:up` levanta MySQL y DynamoDB Local con Docker Compose. En GitHub, el workflow declara las **mismas imágenes** como *services*: GitHub las arranca antes de los pasos y espera a que MySQL responda (`--health-cmd`). Los tests usan las mismas direcciones por defecto (`localhost:3306` y `localhost:8000`), así que no hace falta configurar nada más.

### 3. El CI no tiene permisos ni secretos

- `permissions: contents: read`: el workflow solo puede leer el código. No puede comentar, crear ramas ni publicar nada.
- `persist-credentials: false`: el token de GitHub no queda guardado en la carpeta del repo después del `checkout`.
- `terraform init -backend=false`: Terraform no lee el estado ni necesita credenciales de AWS.

El repo es **público**: cualquiera puede abrir un pull request desde un *fork*. Un CI sin secretos ni permisos no tiene nada que robar. Las credenciales de AWS llegan en el paso 36, solo para el despliegue y solo desde `main`.

### 4. Acciones fijadas por SHA

Cada acción de terceros (`actions/checkout`, `pnpm/action-setup`, ...) va fijada por el **SHA del commit**, con la versión en un comentario:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

Una etiqueta como `v7` se puede mover a otro commit; si alguien compromete esa acción, tu workflow correría su código nuevo. Un SHA siempre apunta al mismo código. Es la misma idea que fijar las versiones exactas en `package.json`.

### 5. Misma versión de Node y pnpm que en tu PC

- Node `26.13.0`, la misma que el `Dockerfile`.
- `pnpm/action-setup` sin `version`: lee `packageManager` del `package.json` (pnpm 12.18.0).
- `pnpm install --frozen-lockfile`: si `pnpm-lock.yaml` no coincide con los `package.json`, falla en vez de actualizarlo. Así el CI prueba exactamente las versiones que se van a desplegar.

### 6. `concurrency`: no revisar dos veces lo mismo

Si subes un commit nuevo a un pull request mientras el CI del anterior sigue corriendo, el anterior se cancela. En `main` no se cancela: cada fusión se revisa completa.

## Hazlo en tu PC

Esta vez casi todo es en el navegador.

### 1. Mira el CI en este mismo pull request

El pull request de este paso ya trae el workflow, así que GitHub lo corre sobre sí mismo. Antes de fusionarlo:

1. Abre el pull request en GitHub y baja hasta el final. Verás los 4 checks, primero en amarillo (corriendo) y luego en verde.
2. Pulsa **Details** en cualquiera de ellos: ves cada paso y su salida, como en tu terminal.
3. También aparece **Vercel**: desde el paso 34, Vercel compila una *preview* de cada pull request.

Si los 4 están en verde, fusiónalo.

### 2. Traer `main`

```bash
cd /d/Projects/charanatech
git switch main
git pull
```

Arriba del `README.md` en GitHub aparece ahora la insignia **CI passing**.

### 3. Proteger `main` con una regla

En GitHub, en el repo:

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. **Ruleset Name**: `main`.
3. **Enforcement status**: **Active**.
4. **Target branches → Add target → Include default branch**.
5. En **Rules**, deja marcados **Restrict deletions** y **Block force pushes**, y marca además:
   - **Require a pull request before merging**. En **Required approvals** deja `0`: trabajas solo y GitHub no deja aprobar tu propio pull request.
   - **Require status checks to pass** → **Add checks** y agrega los 4: `Formato, lint, tipos y tests`, `Tests de integración (MySQL y DynamoDB)`, `Terraform (formato y validación)` e `Imágenes Docker (API y workers)`. Aparecen en la lista porque ya corrieron una vez.
6. **Create**.

Desde ahora, `main` solo cambia por pull request y con los 4 checks en verde. Si alguna vez quieres subir algo directo a `main` (como las fotos del paso 33), GitHub lo rechaza: crea una rama y un pull request.

### 4. (Opcional) Ver un CI en rojo

Para ver qué pasa cuando algo falla:

```bash
git switch -c prueba/ci-rojo
echo "const   x =1" >> apps/web/src/lib/money.ts
git commit -am "test: break formatting on purpose"
git push -u origin prueba/ci-rojo
```

Abre un pull request de esa rama. En un minuto, **Formato, lint, tipos y tests** se pone en rojo, y el botón **Merge** queda bloqueado por la regla. En **Details** ves el archivo que falló. Después cierra el pull request sin fusionarlo y borra la rama:

```bash
git switch main
git branch -D prueba/ci-rojo
git push origin --delete prueba/ci-rojo
```

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Cambiaste un `package.json` sin correr `pnpm install` | Corre `pnpm install` en tu PC y sube `pnpm-lock.yaml` |
| Falla `pnpm format:check` | Algún archivo sin formato | `pnpm format` y sube el cambio |
| Falla `test:cov` con `coverage threshold` | Código nuevo sin tests | Agrega tests hasta pasar el 80 % |
| No aparecen los checks en **Add checks** | El CI todavía no corrió nunca | Primero fusiona el PR de este paso; corre en `main` |
| La regla no deja fusionar aunque todo esté verde | Falta un check o el nombre no coincide | Revisa en el ruleset que los 4 nombres sean exactos |

## Costo

- **GitHub Actions**: gratis e ilimitado en repos públicos.

## Para la entrevista

- "Cada pull request pasa por GitHub Actions: formato, lint, tipos, tests con cobertura mínima del 80 %, tests de integración contra MySQL y DynamoDB en contenedores de servicio, validación de Terraform y el build de las imágenes Docker. Cuatro trabajos en paralelo, unos 5 minutos."
- "`main` está protegida con un ruleset: solo cambia por pull request y con los cuatro checks en verde. No hay pushes directos ni force push."
- "El CI no tiene secretos ni permisos de escritura (`contents: read`, `persist-credentials: false`), porque el repo es público y cualquiera puede abrir un PR desde un fork. Las credenciales de AWS son solo para el despliegue, en el paso siguiente."
- "Las acciones de terceros están fijadas por SHA, no por etiqueta: una etiqueta se puede mover y un SHA no. Es protección contra ataques a la cadena de suministro."
- "`pnpm install --frozen-lockfile` asegura que el CI prueba exactamente las versiones del lockfile, las mismas que se despliegan."
