'use client';

import Form from 'next/form';
import { useSearchParams } from 'next/navigation';

/**
 * Buscador de la cabecera. `next/form` es un <form> normal (funciona sin JavaScript),
 * pero cuando JavaScript está listo navega a /productos?q=… sin recargar toda la página.
 */
export function SearchBox() {
  const q = useSearchParams().get('q') ?? '';

  return (
    <Form action="/productos" role="search" aria-label="Buscar productos">
      <label htmlFor="q" className="sr-only">
        Buscar productos
      </label>
      <input
        // key: si la URL cambia (por ejemplo, al limpiar la búsqueda), el campo se actualiza.
        key={q}
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Buscar productos…"
        className="h-9 w-full rounded-control border border-line bg-sunken px-3 text-sm placeholder:text-muted"
      />
    </Form>
  );
}
