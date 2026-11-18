import Link from 'next/link';

/** Página 404 de toda la tienda (rutas que no existen o productos que la API no encuentra). */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-16 text-center">
      <span className="font-display text-sm font-bold tracking-widest text-muted">ERROR 404</span>
      <h1 className="text-xl font-bold">No encontramos esta página</h1>
      <p className="max-w-sm text-muted">
        Puede que el enlace esté mal escrito o que el producto ya no esté a la venta.
      </p>
      <Link href="/" className="text-sm font-semibold text-action hover:underline">
        Volver a la tienda
      </Link>
    </div>
  );
}
