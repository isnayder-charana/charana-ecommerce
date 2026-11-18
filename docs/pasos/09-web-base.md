# Paso 9 (fase 2): base de la tienda en Next.js

## Qué hicimos

Creamos `apps/web`, la tienda, con el diseño que elegimos: la estructura de la opción **Vitrina**, las tarjetas del **Setup nocturno** y solo colores que cumplen una función. Por ahora muestra la portada y los productos del seed escritos a mano. En el siguiente paso los traemos de la API.

```
apps/web/
├─ next.config.ts              # configuración de Next
├─ postcss.config.mjs          # conecta Tailwind v4 con Next
├─ tsconfig.json               # hereda de tsconfig.base.json
└─ src/
   ├─ app/
   │  ├─ globals.css           # tokens de diseño (colores, fuentes, bordes)
   │  ├─ layout.tsx            # fuentes + cabecera + pie, comunes a todas las páginas
   │  └─ page.tsx              # portada (/)
   ├─ components/
   │  ├─ layout/               # site-header, site-footer
   │  └─ ui/                   # button, badge, price: piezas sin lógica de negocio
   ├─ features/catalog/        # todo lo que es del catálogo: tipo Product, tarjeta, imagen
   └─ lib/                     # cn() para unir clases, formatMoney()
```

La carpeta `features/` sigue la misma idea que los módulos de la API: el código se agrupa por **tema del negocio** (catálogo, carrito, pedidos) y no por tipo de archivo. `components/ui` es lo genérico que cualquier feature puede usar.

## Cómo probarlo

```bash
pnpm install                          # instala Next, React y Tailwind
pnpm --filter @charanatech/web dev    # http://localhost:3001
```

La tienda usa el puerto **3001** porque la API ya ocupa el 3000.

## Los tokens de diseño

En `globals.css` está el bloque `@theme`. Cada variable se convierte en clases de Tailwind:

| Token | Clase de ejemplo | Para qué se usa |
| --- | --- | --- |
| `--color-page` `#ededed` | `bg-page` | Fondo gris de toda la página |
| `--color-surface` `#ffffff` | `bg-surface` | Bloques: cabecera, tarjetas, paneles |
| `--color-ink` `#1f1f1f` | `text-ink` | Texto principal |
| `--color-muted` `#6b6b6b` | `text-muted` | Texto secundario, precio anterior |
| `--color-action` `#2f6fed` | `bg-action` | Solo lo que se puede hacer: botones, enlaces, foco |
| `--color-deal` `#00a650` | `text-deal` | Lo bueno para el cliente: % OFF, envío gratis, stock |
| `--color-badge` `#ff7733` | `bg-badge` | Solo la etiqueta "Más vendido" |
| `--color-danger` `#d93025` | `text-danger` | Errores y "Sin stock" |

**Regla:** si un color no comunica nada, no se usa. Así el usuario aprende rápido que azul = puedo hacer clic, verde = me conviene.

¿Por qué tokens y no `bg-[#2f6fed]` en cada componente? Porque si mañana cambiamos el azul, se cambia en **un solo lugar**. Además el nombre dice la intención (`action`), no el color.

## Fuentes con next/font

En `layout.tsx` cargamos **Manrope** (todo el texto) y **Chakra Petch** (solo el nombre en las tarjetas) con `next/font/google`. Next las descarga al compilar y las sirve desde nuestro propio dominio:

- El navegador no hace peticiones a Google (más rápido y más privado).
- No hay "salto" del texto cuando la fuente termina de cargar.

Cada fuente crea una variable CSS (`--font-manrope`, `--font-chakra`) que los tokens `--font-sans` y `--font-display` usan.

## Los componentes

- **`Button`**: tres variantes, `primary` (Comprar ahora), `secondary` (Agregar al carrito, azul suave) y `link`. Las variantes viven en un objeto, así TypeScript solo deja usar las que existen.
- **`Price`**: recibe **centavos**, igual que la API (`priceCents`). Nunca guardamos precios como `59.99` porque los decimales en JavaScript fallan (`0.1 + 0.2 = 0.30000000000000004`). Solo al mostrarlo se divide entre 100 con `Intl.NumberFormat`. Si recibe un precio anterior mayor, lo tacha y pone el `% OFF` en verde.
- **`ProductCard`**: borde fino, foto en un recuadro interior, nombre en Chakra Petch y un anillo azul al pasar el mouse **o al llegar con Tab** (`focus-within`), para que también funcione con teclado. El enlace del nombre se estira sobre toda la tarjeta con `::after`, así se puede hacer clic en cualquier parte sin anidar enlaces.
- **`ProductImage`**: si el producto no tiene foto (`imageUrl: null`, como ahora), dibuja un ícono de su categoría.

## Lo que todavía es de ejemplo

- `sample-products.ts` copia el seed de la API. **Se borra en el siguiente paso**, cuando la portada pida los productos a `GET /api/products` con TanStack Query.
- Los descuentos de los audífonos y el cargador son inventados para ver el estilo. La API no tiene "precio anterior": si lo queremos de verdad, hay que agregar `compareAtPriceCents` al producto en el backend.
- El buscador, las categorías y el carrito todavía no hacen nada.

## TypeScript 7 y `next build`

Igual que en la API: TypeScript 7 todavía no expone la API que Next usa para revisar tipos durante el build. Por eso `next.config.ts` tiene `typescript.ignoreBuildErrors: true` y los tipos se revisan con `pnpm typecheck` (`tsc --noEmit`), que ya forma parte de `pnpm check`. No perdemos ninguna revisión, solo cambia quién la hace.

## Otros cambios

- `biome.json`: `css.parser.tailwindDirectives: true`, para que Biome entienda `@theme` y `@apply`.
- `.prettierignore`: ignora `next-env.d.ts` y `.next/`, que Next genera solo.
- La cabecera usa `<search>`, el elemento HTML nuevo para formularios de búsqueda (los lectores de pantalla lo anuncian como "búsqueda").

## Versiones fijadas

| Paquete | Versión |
| --- | --- |
| next | 16.4.6 |
| react / react-dom | 19.3.1 |
| tailwindcss / @tailwindcss/postcss | 4.3.5 |
| @types/react / @types/react-dom | 19.3.0 |
