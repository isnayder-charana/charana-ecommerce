import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted">
        <span>© 2026 CharanaTech · Proyecto de portafolio</span>
        <span>
          Pagos de prueba con Stripe · Fotos de Unsplash ·{' '}
          <Link href="/privacidad" className="hover:text-ink hover:underline">
            Privacidad
          </Link>
        </span>
      </div>
    </footer>
  );
}
