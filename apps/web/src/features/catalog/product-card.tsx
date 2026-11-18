import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { cn } from '@/lib/cn';
import { categoryLabel, type Product } from './product';
import { ProductImage } from './product-image';

type ProductCardProps = {
  product: Product;
  /** Precio anterior (la API todavía no lo tiene; se agrega en un paso posterior). */
  compareAtCents?: number | null;
  bestseller?: boolean;
};

/**
 * Tarjeta de producto: borde fino, foto en un recuadro interior, nombre en Chakra Petch
 * y un anillo azul al pasar el mouse o al enfocarla con el teclado.
 */
export function ProductCard({ product, compareAtCents, bestseller = false }: ProductCardProps) {
  return (
    <article
      className={cn(
        'group relative flex flex-col gap-2 rounded-card border border-line bg-surface p-2.5 transition-shadow',
        'hover:border-action hover:ring-1 hover:ring-action hover:shadow-[0_8px_20px_-12px_rgb(47_111_237/0.5)]',
        'focus-within:border-action focus-within:ring-1 focus-within:ring-action',
      )}
    >
      <ProductImage name={product.name} category={product.category} imageUrl={product.imageUrl} />

      <div className="flex min-h-5 flex-col items-start gap-1">
        {bestseller && <Badge tone="bestseller">Más vendido</Badge>}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {categoryLabel(product.category)}
        </span>
      </div>

      <h3 className="font-display text-[13px] font-bold uppercase leading-tight tracking-wide">
        {/* El enlace cubre toda la tarjeta con ::after, así toda la tarjeta es clicable. */}
        <Link
          href={`/productos/${product.id}`}
          className="after:absolute after:inset-0 focus:outline-none"
        >
          {product.name}
        </Link>
      </h3>

      <div className="mt-auto flex flex-col gap-1">
        <Price
          priceCents={product.price.cents}
          currency={product.price.currency}
          compareAtCents={compareAtCents}
        />
        {product.inStock ? (
          <span className="text-xs font-semibold text-deal">En stock</span>
        ) : (
          <span className="text-xs font-semibold text-danger">Sin stock</span>
        )}
      </div>
    </article>
  );
}
