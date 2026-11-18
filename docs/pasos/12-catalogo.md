# Paso 12 (fase 2): página de catálogo con búsqueda y categorías

## Qué hicimos

Ahora existe **`/productos`**: todos los productos con un panel de categorías, el número de resultados y paginación de 12 en 12. El buscador y las categorías de la cabecera llevan aquí.

```
apps/web/src/
├─ app/productos/page.tsx                  # la página de catálogo (servidor)
├─ components/layout/
│  ├─ search-box.tsx                       # buscador de la cabecera (next/form)
│  └─ site-header.tsx                      # categorías y buscador apuntan a /productos
├─ components/ui/button.tsx                # + buttonClasses() para enlaces con forma de botón
└─ features/catalog/
   ├─ catalog-params.ts                    # URL ⇄ filtros
   ├─ pagination.tsx                       # Anterior · 1 2 3 · Siguiente
   └─ product-grid.tsx                     # + contador de resultados y paginación
```

Pruébalo: http://localhost:3001/productos, busca "cable" en la cabecera o entra a una categoría.

## Los filtros viven en la URL

```
/productos?q=cable&categoria=cables&pagina=2
```

En vez de guardar la búsqueda en un `useState`, la guardamos en la dirección. Eso da varias cosas gratis:

- **Se puede compartir:** si mandas el enlace, la otra persona ve exactamente la misma búsqueda.
- **Recargar no pierde nada**, y los botones Atrás y Adelante del navegador funcionan.
- **El servidor la conoce:** `page.tsx` recibe `searchParams`, pide los productos antes de enviar la página (igual que en el detalle) y la página llega completa.

Para no repetir lógica, `catalog-params.ts` tiene dos funciones opuestas:

- `parseCatalogParams(url)` → filtros. **Limpia la entrada:** una categoría que no existe o `pagina=abc` se ignoran en lugar de romper la página. Nunca confíes en lo que viene en la URL; cualquiera puede escribirla a mano.
- `catalogHref(filtros)` → URL. La usan la cabecera, el panel de categorías, la paginación y la ruta del detalle (Inicio › Cables).

Detalles de comportamiento:
- Al cambiar de categoría **se conserva la búsqueda** y se vuelve a la página 1 ("teclado" en Periféricos).
- "Quitar filtros" vuelve a `/productos`.

## `<Link>` en lugar de `<a>`

Cambiamos los enlaces internos a `Link` de Next. La diferencia:

- `<a>` recarga **toda** la página: se pierde la caché de TanStack Query y se vuelve a descargar todo.
- `<Link>` solo cambia lo que cambió, y además **precarga** las páginas de los enlaces visibles. Por eso pasar de una categoría a otra se siente instantáneo.

El enlace al carrito tiene `prefetch={false}` porque esa página todavía no existe (si no, Next intentaría precargarla y daría 404 en la consola).

## El buscador: `next/form`

`<Form action="/productos">` de `next/form` es un formulario normal: al enviarlo arma `/productos?q=lo-que-escribiste`. Funciona incluso antes de que cargue JavaScript, y cuando JavaScript está listo navega sin recargar la página, igual que `<Link>`.

El campo muestra la búsqueda actual porque lee la URL con `useSearchParams()`. Ese hook obliga a envolver el componente en `<Suspense>`: así Next puede generar el resto de la cabecera de antemano y completar el buscador en el navegador.

## Estados de la lista

Se suman a los del paso 10:

| Situación | Qué se ve |
| --- | --- |
| Hay resultados | "15 resultados", la cuadrícula y la paginación (si hay más de una página) |
| Búsqueda sin resultados | "No encontramos productos para “zzz”." y un enlace a todos los productos |
| Categoría vacía | "No hay productos en esta categoría todavía." (pasa hoy con Fundas) |

El contador tiene `aria-live="polite"`: cuando cambia, un lector de pantalla lo anuncia sin interrumpir.

## En celular

El panel de categorías se convierte en una fila de botones que se desliza de lado. El panel tiene `min-w-0`: sin eso, la fila larga empujaba toda la página hacia la derecha (los elementos de un grid no se encogen por debajo de su contenido salvo que se lo indiques).

## Otros cambios

- Se agregó la categoría **Fundas**, que ya existía en la API.
- El botón de la portada ahora dice **"Ver catálogo"** y lleva a `/productos`. Es un enlace con aspecto de botón (`buttonClasses()`), porque lleva a otra página y no ejecuta una acción.
