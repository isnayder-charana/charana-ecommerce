'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { addToCart, type CartActionResult } from './cart.actions';

/** Botones de la caja de compra: "Comprar ahora" y "Agregar al carrito". */
export function AddToCart({ productId, quantity }: { productId: string; quantity: number }) {
  const router = useRouter();
  // useTransition: mientras la Server Action trabaja, isPending es true (botones desactivados).
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CartActionResult | null>(null);

  function add(thenGoToCart: boolean) {
    startTransition(async () => {
      const response = await addToCart(productId, quantity);
      setResult(response);
      if (response.ok && thenGoToCart) router.push('/carrito');
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => add(true)} disabled={isPending}>
        Comprar ahora
      </Button>
      <Button variant="secondary" onClick={() => add(false)} disabled={isPending}>
        {isPending ? 'Agregando…' : 'Agregar al carrito'}
      </Button>

      {/* role="status": los lectores de pantalla anuncian el resultado. */}
      <p role="status" className="min-h-5 text-sm">
        {result?.ok && (
          <span className="font-semibold text-deal">
            Agregado al carrito.{' '}
            <Link href="/carrito" className="text-action hover:underline">
              Ver carrito
            </Link>
          </span>
        )}
        {result && !result.ok && <span className="text-danger">{result.message}</span>}
      </p>
    </div>
  );
}
