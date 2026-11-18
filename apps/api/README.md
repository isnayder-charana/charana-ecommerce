# apps/api

**OrderHub**: API de catálogo y pedidos en NestJS 12 con arquitectura hexagonal + DDD.

```bash
pnpm dev         # http://localhost:3000/api/health
pnpm test:cov    # tests con cobertura (mínimo 80%)
pnpm typecheck   # revisión de tipos con TypeScript 7
```

Explicación completa en [docs/pasos/02-api-hexagonal.md](../../docs/pasos/02-api-hexagonal.md).

## Base de datos (MySQL + Prisma)

```bash
pnpm db:deploy          # aplica migraciones
pnpm db:seed            # productos de ejemplo
pnpm db:migrate         # crea una migración nueva tras cambiar prisma/schema.prisma
pnpm test:integration   # tests contra MySQL (requiere `pnpm infra:up`)
```
