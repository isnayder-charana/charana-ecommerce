# Paso 11 (fase 2): página de detalle del producto

## Qué hicimos

Al hacer clic en una tarjeta se abre `/productos/<id>` con la ficha del producto: foto, categoría, SKU, nombre, descripción y una **caja de compra** con precio, stock y cantidad. Los botones de compra quedan desactivados hasta el paso del carrito.

```
apps/web/src/
├─ app/
│  ├─ not-found.tsx                 # página 404 de toda la tienda
│  └─ productos/[id]/page.tsx       # ruta dinámica (componente de servidor)
└─ features/catalog/
   ├─ catalog.queries.ts            # + productQuery(id) e isNotFound()
   ├─ product-detail.tsx            # la ficha (componente de cliente)
   └─ quantity-select.tsx           # selector de cantidad
```

Pruébalo con la API encendida: http://localhost:3001/productos/7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1004 (teclado) o …1005 (mouse, sin stock).

## Rutas dinámicas: `[id]`

En Next, una carpeta con corchetes es un **parámetro**. `app/productos/[id]/page.tsx` atiende `/productos/cualquier-cosa`, y la página recibe `params.id`. En Next 16 `params` es una *Promise*, por eso se escribe `const { id } = await params`.

## Servidor + cliente: lo mejor de los dos

En la portada pedimos los productos **desde el navegador**. Aquí hacemos algo distinto, porque esta página es la que un reclutador va a compartir:

1. **En el servidor** (`page.tsx`, sin `'use client'`): se crea un `QueryClient` y se hace `prefetchQuery(productQuery(id))`. El HTML que llega al navegador **ya trae** el nombre, el precio y la descripción.
2. `dehydrate(queryClient)` empaqueta esa caché y `<HydrationBoundary>` la entrega al navegador.
3. **En el cliente** (`product-detail.tsx`): `useQuery(productQuery(id))` encuentra el dato en la caché y **no repite la petición**. A partir de ahí funciona igual que en la portada: estados, reintentos y actualización en segundo plano.

Ventajas: no hay tarjeta gris mientras carga, los buscadores leen el contenido, y la vista previa al compartir el enlace muestra el producto.

Como `productQuery(id)` se usa en los dos lados, la clave de la caché es la misma y todo encaja. Por eso conviene tener las consultas en un solo archivo (`catalog.queries.ts`).

## Título de la pestaña: `generateMetadata`

`generateMetadata` también corre en el servidor y devuelve el `<title>` y la descripción. Con el teclado la pestaña dice **"Teclado mecánico compacto · CharanaTech"** (el `· CharanaTech` sale del `template` del `layout.tsx`).

## Producto que no existe: un 404 de verdad

Si la API responde **404** (no existe) o **400** (el id ni siquiera es un UUID), `isNotFound()` lo detecta y la página llama a `notFound()`. Next responde con **código HTTP 404** y muestra `app/not-found.tsx`.

¿Por qué no basta con un mensaje? Porque una página que dice "no existe" pero responde 200 confunde a los buscadores, que la guardan como si fuera válida.

Además, `productQuery` **no reintenta** un 404: si no existe, preguntar otra vez no lo va a crear. Solo se reintentan fallos de red o del servidor (5xx).

## La caja de compra

Sigue la regla de colores del diseño:

- Precio grande en negro, "En stock" en **verde**, "Sin stock" en **rojo**.
- "Comprar ahora" en **azul** lleno y "Agregar al carrito" en azul suave: la acción principal se distingue de la secundaria.
- Cantidad de 1 hasta el stock, con un máximo de 10 por compra.
- Se avisa que el pago es de prueba con Stripe, para que nadie dude en probar.

En celular la caja baja debajo de la descripción; en pantallas grandes queda a la derecha, como en las tiendas que tomamos de referencia.

## Accesibilidad

- La ruta de navegación (Inicio › Periféricos › Teclado) usa `<nav aria-label="Ruta">` y `aria-current="page"` en el producto actual.
- El selector de cantidad tiene su `<label>` conectado con `htmlFor`.
- Mientras carga, un texto oculto con `role="status"` avisa "Cargando producto…" a los lectores de pantalla.
