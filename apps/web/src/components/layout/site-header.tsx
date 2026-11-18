import Link from 'next/link';
import { Suspense } from 'react';
import { catalogHref } from '@/features/catalog/catalog-params';
import { AccountMenu } from '@/features/auth/account-menu';
import { CATEGORY_LABELS } from '@/features/catalog/product';
import { CartLink } from './cart-link';
import { SearchBox } from './search-box';

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 lg:flex-nowrap">
        <Link href="/" className="leading-tight">
          <span className="block text-lg font-extrabold tracking-tight">CharanaTech</span>
          <span className="block text-[10px] text-muted">powered by OrderHub</span>
        </Link>

        <nav aria-label="Categorías" className="hidden shrink-0 gap-4 text-sm text-muted lg:flex">
          {Object.entries(CATEGORY_LABELS).map(([slug, label]) => (
            <Link key={slug} href={catalogHref({ category: slug })} className="hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>

        <search className="order-last w-full md:order-none md:ml-auto md:w-64 lg:w-48 lg:min-w-0 lg:shrink">
          {/* useSearchParams necesita Suspense: lo que está fuera se puede generar de antemano. */}
          <Suspense>
            <SearchBox />
          </Suspense>
        </search>

        <div className="ml-auto flex shrink-0 items-center gap-5 whitespace-nowrap md:ml-0">
          {/* useSearchParams (para volver a la misma página) necesita Suspense. */}
          <Suspense>
            <AccountMenu />
          </Suspense>
          <CartLink />
        </div>
      </div>
    </header>
  );
}
