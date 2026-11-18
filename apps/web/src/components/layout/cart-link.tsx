import Link from 'next/link';
import { countItems } from '@/features/cart/cart';
import { readCart } from '@/features/cart/cart-cookie';

/**
 * Componente de servidor: lee la cookie en cada petición, así el número llega correcto
 * desde el primer momento (sin mostrar "0" y luego saltar al número real).
 */
export async function CartLink() {
  const count = countItems(await readCart());

  return (
    <Link
      href="/carrito"
      aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}
      className="flex items-center gap-1.5 text-sm font-semibold"
    >
      Carrito
      <span className="rounded-full bg-action px-1.5 text-[11px] text-white tabular-nums">
        {count}
      </span>
    </Link>
  );
}
