# Paso 13 (fase 2): carrito guardado en una cookie

## Qué hicimos

- En la ficha del producto funcionan **"Agregar al carrito"** (muestra "Agregado al carrito. Ver carrito") y **"Comprar ahora"** (agrega y te lleva al carrito).
- La cabecera muestra cuántas unidades hay en el carrito.
- Nueva página **`/carrito`**: cambiar cantidad, quitar productos, subtotal por producto y total. "Continuar compra" queda desactivado hasta el paso del pago con Stripe.
- No hace falta iniciar sesión: el carrito vive en una **cookie** del navegador y dura 30 días.

```
apps/web/src/
├─ app/carrito/page.tsx                  # la página del carrito (servidor)
├─ components/layout/cart-link.tsx       # "Carrito 3" en la cabecera (servidor)
└─ features/cart/
   ├─ cart.ts                            # forma del carrito + funciones puras (agregar, cambiar cantidad)
   ├─ cart-cookie.ts                     # leer y escribir la cookie (solo servidor)
   ├─ cart.actions.ts                    # Server Actions: addToCart, updateCartQuantity, removeFromCart
   ├─ cart-view.ts                       # junta la cookie con los datos actuales de la API
   ├─ add-to-cart.tsx                    # botones de la ficha (cliente)
   └─ cart-line-item.tsx                 # una fila del carrito (cliente)
```

## ¿Cookie o localStorage?

Las dos guardan datos en el navegador. Elegimos cookie por esto:

| | Cookie (lo que usamos) | localStorage |
| --- | --- | --- |
| ¿La ve el servidor? | **Sí**, viaja en cada petición | No, solo existe en el navegador |
| Contador de la cabecera | Llega correcto desde el primer momento | Primero muestra 0 y luego salta al número real |
| ¿La puede leer un script malicioso (XSS)? | **No**, con `httpOnly` | Sí |
| Tamaño máximo | 4 KB | ~5 MB |

El límite de 4 KB no es problema porque guardamos lo mínimo (ver abajo) y como máximo 20 productos distintos.

## Qué se guarda (y qué no)

```json
[{ "productId": "7d1c…1004", "quantity": 2 }]
```

**Solo el id y la cantidad.** Nunca el precio ni el nombre. La cookie está en la computadora del usuario y cualquiera puede editarla; si guardáramos el precio, alguien podría cambiar `89.99` por `0.01`. Por eso:

- La página del carrito **pide el precio actual a la API** cada vez (`cart-view.ts`, todos los productos a la vez con `Promise.all`).
- En el paso del pago, el **backend** calculará el total por su cuenta. El frontend nunca decide cuánto se cobra.

Al leer la cookie la validamos con Zod (`cartSchema`). Si alguien la modificó y no tiene la forma correcta, se trata como un carrito vacío en lugar de romper la página.

## Opciones de la cookie

```ts
httpOnly: true,     // el JavaScript del navegador no la puede leer → protege ante XSS
sameSite: 'lax',    // otros sitios no pueden hacer que el navegador la envíe en un POST → protege ante CSRF
secure: true,       // (solo en producción) se envía únicamente por HTTPS
maxAge: 30 días,    // sobrevive aunque cierres el navegador
```

Como es `httpOnly`, el navegador no puede escribirla con JavaScript. ¿Entonces cómo la cambiamos? Con **Server Actions**.

## Server Actions

Un archivo que empieza con `'use server'` exporta funciones que **corren en el servidor**, pero que un componente del navegador llama como si fueran locales:

```tsx
const result = await addToCart(product.id, quantity);   // en add-to-cart.tsx (cliente)
```

Next convierte esa llamada en una petición HTTP, ejecuta la función en el servidor (donde sí puede escribir la cookie) y devuelve el resultado. No tuvimos que crear un endpoint ni usar `fetch`.

Dos cosas importantes:

1. **Son endpoints públicos.** Cualquiera podría llamarlas con datos inventados, por eso validan todo con Zod y `addToCart` le pregunta a la API si el producto existe y si hay stock suficiente.
2. **Cambiar una cookie en una Server Action hace que Next vuelva a dibujar la página.** Por eso el contador de la cabecera se actualiza solo, sin código extra.

En los botones usamos `useTransition`: mientras la acción trabaja, `isPending` es `true` y los botones se desactivan ("Agregando…"), así no se agrega dos veces por un doble clic.

## Reglas del carrito

| Regla | Mensaje |
| --- | --- |
| Máximo 10 unidades por producto | "Máximo 10 unidades por producto (ya tienes 8 en el carrito)." |
| No más que el stock | "Solo quedan 12 unidades de este producto." |
| Máximo 20 productos distintos | "El carrito admite hasta 20 productos distintos." |
| El producto se eliminó de la tienda | En el carrito: "Un producto de tu carrito ya no está a la venta" + Quitar |
| El stock bajó después de agregarlo | La fila avisa en rojo y el resumen pide revisarla |

Las funciones que calculan el carrito (`addLine`, `setLineQuantity`, `countItems` en `cart.ts`) son **puras**: reciben datos y devuelven datos, sin cookies ni red. Así se entienden fácil y se pueden probar solas cuando agreguemos Vitest.

`cart-cookie.ts` y `cart-view.ts` empiezan con `import 'server-only'`: si por error un componente del navegador los importa, el build falla en vez de filtrar código del servidor al navegador.

## Un efecto secundario: páginas dinámicas

Como la cabecera lee la cookie, **todas las páginas** se generan en cada petición (antes la portada se generaba una sola vez al compilar). Es lo esperado en una tienda: cada visitante tiene su propio carrito. El catálogo sigue siendo rápido porque los datos se guardan en la caché de TanStack Query.

## Versiones fijadas

| Paquete | Versión |
| --- | --- |
| server-only | 0.0.1 |
