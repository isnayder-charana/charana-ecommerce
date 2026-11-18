import type { Metadata } from 'next';
import { Chakra_Petch, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import './globals.css';
import { Providers } from './providers';

// next/font descarga las fuentes al compilar y las sirve desde nuestro dominio:
// sin peticiones a Google en el navegador y sin "saltos" de texto al cargar.
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const chakra = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-chakra',
});

export const metadata: Metadata = {
  title: { default: 'CharanaTech', template: '%s · CharanaTech' },
  description: 'Accesorios tecnológicos. Tienda de portafolio powered by OrderHub.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${chakra.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
