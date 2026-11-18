# Paso 14 (fase 2): tests del frontend con Vitest

## Qué hicimos

La tienda ahora tiene **40 tests** que corren en ~4 segundos, y `pnpm check` los ejecuta junto con los de la API. Si la cobertura baja de **80 %**, `pnpm check` falla, igual que en el backend.

```bash
pnpm --filter @charanatech/web test          # una vez
pnpm --filter @charanatech/web test:watch    # se repiten solos al guardar un archivo
pnpm --filter @charanatech/web test:cov      # con reporte de cobertura
```

```
apps/web/
├─ vitest.config.ts               # entorno jsdom, alias @/, cobertura mínima 80 %
└─ src/
   ├─ test/
   │  ├─ setup.ts                 # jest-dom + limpieza entre tests
   │  └─ fixtures.ts              # aProduct(), aProductList(), jsonResponse()
   └─ …/*.test.ts(x)              # cada test vive al lado de lo que prueba
```

## ¿Por qué Vitest y no Jest, como en la API?

Los dos tienen casi la misma API (`describe`, `it`, `expect`, `vi.fn()` ≈ `jest.fn()`). Vitest usa **Vite** para transformar el código, así que entiende TypeScript y JSX sin configuración extra y es más rápido. En la API seguimos con Jest porque Nest y SWC ya estaban configurados para él; no hay ventaja en migrar.

## Qué probamos

| Archivo | Qué verifica |
| --- | --- |
| `money.test.ts` | Centavos → texto ("$ 59.99") y % de descuento |
| `cart.test.ts` | Agregar, sumar, máximo 10, quitar con 0, contar unidades, rechazar una cookie manipulada |
| `catalog-params.test.ts` | URL → filtros (ignorando valores raros) y filtros → URL, ida y vuelta |
| `api-client.test.ts` | URL con filtros, `ApiError` con el código de la API, respuesta con forma incorrecta |
| `catalog.queries.test.ts` | 404/400 = no existe; no reintentar un 404, sí un fallo de red |
| `price.test.tsx` | Precio normal y con descuento |
| `product-card.test.tsx` | Enlace a la ficha, "Sin stock", "Más vendido", foto |
| `pagination.test.tsx` | Página actual marcada, enlaces anterior y siguiente |
| `product-grid.test.tsx` | Cargando → productos, total y paginación, sin resultados, error → Reintentar |
| `product-detail.test.tsx` | Ficha completa, cantidad elegida, sin stock, no existe, error → Reintentar |

## Dos tipos de test

**Funciones puras** (`cart.ts`, `catalog-params.ts`, `money.ts`): reciben datos y devuelven datos. Son los tests más simples y rápidos; por eso conviene sacar la lógica de los componentes a funciones así.

**Componentes** con Testing Library: dibujamos el componente en un navegador simulado (**jsdom**) y lo usamos **como lo haría una persona**:

```tsx
await userEvent.selectOptions(screen.getByLabelText('Cantidad:'), '3');
await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
expect(await screen.findByText('Teclado mecánico compacto')).toBeInTheDocument();
```

Buscamos por **rol y texto visible** ("el botón que dice Reintentar"), no por clases CSS. Si mañana cambiamos el diseño, los tests siguen pasando; si rompemos algo que el usuario ve, fallan. Además, si un test no encuentra un botón por su rol, probablemente un lector de pantalla tampoco: los tests revisan accesibilidad de paso.

- `getBy…` busca algo que ya está; `findBy…` **espera** a que aparezca (por ejemplo, después de que responde la API).

## Simular la API

Durante los tests la API no está corriendo. Reemplazamos `fetch` por una función falsa que responde lo que el test necesita:

```ts
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(aProductList([aProduct()]))));
```

Para probar el botón **Reintentar**, la primera llamada falla y la segunda responde bien (`mockRejectedValueOnce` y luego `mockResolvedValue`). `setup.ts` deshace estos reemplazos después de cada test para que no se contagien.

Cada test crea su propio `QueryClient` con `retry: false` (sin reintentos, para que el error aparezca al toque) y `retryDelay: 0`.

## Qué NO cubren estos tests

Las Server Actions y la cookie del carrito (`cart.actions.ts`, `cart-cookie.ts`) solo funcionan dentro de Next, que es quien maneja las cookies. Por eso están excluidas de la cobertura y en `product-detail.test.tsx` reemplazamos los botones de compra con `vi.mock`. Se probarán **de punta a punta con Playwright** en la fase 5, con un navegador real contra la tienda y la API corriendo.

La lógica del carrito sí está probada, porque vive en las funciones puras de `cart.ts`.

## Versiones fijadas

| Paquete | Versión |
| --- | --- |
| vitest / @vitest/coverage-v8 | 5.1.0 |
| vite | 8.3.8 |
| jsdom | 31.0.0 |
| @testing-library/react | 16.3.3 |
| @testing-library/dom | 10.4.2 |
| @testing-library/jest-dom | 7.0.1 |
| @testing-library/user-event | 14.6.9 (la 14.6.10 salió hace menos de un día y pnpm la bloquea) |
