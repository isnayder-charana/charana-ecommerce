import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { ProductGrid } from '@/features/catalog/product-grid';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-12 text-center">
        <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">
          Carga más rápido. Escucha mejor.
        </h1>
        <p className="max-w-md text-muted">
          Accesorios elegidos para tu escritorio y tu día a día.
        </p>
        <Link href="/productos" className={buttonClasses({ className: 'mt-2' })}>
          Ver catálogo
        </Link>
      </section>

      <section aria-labelledby="destacados" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="destacados" className="text-lg font-bold">
            Destacados
          </h2>
          <Link href="/productos" className="text-sm text-action hover:underline">
            Ver todo
          </Link>
        </div>

        <ProductGrid filters={{ pageSize: 6 }} />
      </section>
    </div>
  );
}
