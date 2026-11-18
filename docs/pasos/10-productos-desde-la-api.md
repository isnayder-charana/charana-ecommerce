# Paso 10 (fase 2): productos reales desde la API

## Qué hicimos

La portada ya no usa productos escritos a mano: los pide a `GET /api/products` con **TanStack Query**. Para que el navegador lo permita, la API ahora tiene **CORS**.

```
apps/api/
├─ src/config/env.ts              # nueva variable CORS_ORIGINS
├─ src/configure-app.ts           # app.enableCors(...)
└─ test/app.e2e-spec.ts           # test: la tienda sí, otro sitio no

apps/web/
├─ .env.example                   # NEXT_PUBLIC_API_URL
└─ src/
   ├─ app/providers.tsx           # QueryClientProvider (la caché de TanStack Query)
   ├─ lib/api-client.ts           # apiGet(): fetch + validación con Zod + ApiError
   └─ features/catalog/
      ├─ product.ts               # esquemas Zod del producto y de la lista paginada
      ├─ catalog.queries.ts       # productsQuery(): queryKey + queryFn
      └─ product-grid.tsx         # estados: cargando, error, vacío y datos
```

`sample-products.ts` ya no se usa. **Bórralo a mano** (`apps/web/src/features/catalog/sample-products.ts`): yo no tengo permiso para borrar archivos en tu PC.

## Cómo probarlo

```bash
# Terminal 1: la API (con PERSISTENCE=memory no necesitas Docker)
pnpm --filter @charanatech/api dev

# Terminal 2: la tienda
pnpm --filter @charanatech/web dev      # http://localhost:3001
```

Si apagas la API y recargas la tienda, verás el mensaje "No pudimos cargar los productos" con el botón **Reintentar**.

## CORS: por qué el navegador bloquea a la tienda

La tienda vive en `http://localhost:3001` y la API en `http://localhost:3000`. Para el navegador son **orígenes distintos** (cambia el puerto), y por seguridad no deja que una página lea respuestas de otro origen, salvo que ese otro origen lo autorice con la cabecera `Access-Control-Allow-Origin`.

Por eso la API ahora hace:

```ts
app.enableCors({ origin: CORS_ORIGINS });   // por defecto: http://localhost:3001
```

- Es una **lista blanca**, no `*`. Si otro sitio intenta llamar a la API desde el navegador, no recibe la cabecera y el navegador bloquea la respuesta. El test e2e comprueba ambos casos.
- Cuando la tienda esté en Vercel (fase 4) agregaremos su dirección: `CORS_ORIGINS=http://localhost:3001,https://charanatech.vercel.app`.
- CORS solo lo aplica el **navegador**. Postman o `curl` no lo usan, por eso antes todo funcionaba desde Swagger.

## TanStack Query: qué resuelve

Sin una librería, cada componente tendría su `useEffect` + `useState` para `loading`, `error` y `data`, y si dos componentes piden lo mismo se haría dos veces. TanStack Query se encarga de:

- **Caché por clave.** `queryKey: ['products', { pageSize: 6 }]`. Si otro componente pide la misma clave, usa el mismo dato y no repite la petición.
- **Datos frescos.** `staleTime: 60_000`: durante 1 minuto el dato se considera fresco. Después, al volver a la pestaña, se actualiza en segundo plano mientras se sigue mostrando lo anterior.
- **Reintentos.** `retry: 1`: si falla, reintenta una vez antes de mostrar el error.
- **Cancelación.** La `queryFn` recibe un `signal`; si el usuario se va antes de que llegue la respuesta, la petición se cancela.

`queryOptions()` junta la clave y la función en un solo lugar (`catalog.queries.ts`). Así, cuando hagamos la página de búsqueda, se reutiliza `productsQuery({ q, category, page })` sin repetir nada.

El `QueryClient` se crea dentro de `useState` en `providers.tsx`. Si se creara fuera, en el servidor de Next se compartiría entre usuarios distintos.

## Por qué validar la respuesta con Zod

TypeScript solo revisa tipos **mientras escribes**. En el navegador, `response.json()` devuelve lo que sea que mande el servidor. Si mañana la API cambia `price.cents` por `priceCents`, sin validar veríamos `$ NaN` en la tarjeta y sería difícil saber por qué.

Con `apiGet('/products', productListSchema)`:

1. Zod revisa la respuesta. Si no coincide, falla **en ese punto** con un mensaje que dice qué campo está mal.
2. El tipo `Product` se **deduce** del esquema (`z.infer`), así que tipo y validación nunca se desincronizan. Es la misma idea que usamos en la API con Swagger.

Si la API responde con error, `apiGet` lanza un `ApiError` con el mismo `code` y `message` que manda el `DomainErrorFilter` (por ejemplo `PRODUCT_NOT_FOUND`). Lo usaremos en la página de detalle.

## Los estados de la lista

`ProductGrid` siempre muestra algo útil:

| Estado | Qué ve el usuario |
| --- | --- |
| Cargando | 6 tarjetas grises que parpadean (*skeleton*), con el mismo tamaño que las reales para que nada salte al cargar. Un lector de pantalla anuncia "Cargando productos…". |
| Error | Mensaje y botón **Reintentar** (`refetch()`). |
| Vacío | "No encontramos productos con esos filtros." |
| Datos | Las tarjetas. |

## `'use client'`

En Next, los componentes son **de servidor** por defecto. `ProductGrid` y `Providers` usan hooks del navegador (`useQuery`, `useState`), por eso empiezan con `'use client'`. La portada (`page.tsx`) sigue siendo de servidor y solo inserta `<ProductGrid />`.

## Cambios de diseño

- "Más vendidos" pasó a llamarse **"Destacados"**: la API todavía no sabe cuánto se vendió cada producto, y no queremos mostrar algo falso a un reclutador.
- Se quitaron los descuentos de ejemplo. `Price` y `Badge` siguen listos para usarse cuando el backend tenga precio anterior y ventas.

## Versiones fijadas

| Paquete | Versión |
| --- | --- |
| @tanstack/react-query | 5.107.1 |
| zod (web) | 4.6.7 (la misma que la API) |
