import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isNotFound, productQuery } from '@/features/catalog/catalog.queries';
import { ProductDetail } from '@/features/catalog/product-detail';

type PageProps = { params: Promise<{ id: string }> };

/**
 * Componente de SERVIDOR. Pide el producto antes de enviar la página, así el HTML ya llega
 * con el nombre, el precio y la descripción (mejor para buscadores y para la vista previa
 * cuando alguien comparte el enlace).
 */
export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;

  const queryClient = new QueryClient();
  // prefetchQuery nunca lanza error: si la API falla, el cliente lo reintenta y muestra el estado.
  await queryClient.prefetchQuery(productQuery(id));

  // Si la API dice que no existe, respondemos 404 de verdad (no una página 200 con un aviso).
  if (isNotFound(queryClient.getQueryState(productQuery(id).queryKey)?.error)) notFound();

  return (
    // dehydrate() pasa la caché del servidor al navegador: useQuery la encuentra y no repite la petición.
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductDetail id={id} />
    </HydrationBoundary>
  );
}

/** Título y descripción de la pestaña y de la vista previa al compartir. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await new QueryClient().fetchQuery(productQuery(id)).catch(() => null);
  if (!product) return { title: 'Producto no encontrado' };
  return { title: product.name, description: product.description };
}
