import { cn } from '@/lib/cn';

/** Trazos simples por categoría, para cuando el producto todavía no tiene foto. */
const ICONS: Record<string, string> = {
  audio:
    'M10 28v-4a14 14 0 0 1 28 0v4 M7 30a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z M33 30a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z',
  cargadores:
    'M17 10h14a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5V15a5 5 0 0 1 5-5z M19 10V5 M29 10V5 M25 20l-3 5h4l-3 5',
  cables:
    'M8 8h6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z M34 33h6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z M11 15c0 12 26 6 26 18',
  perifericos:
    'M8 14h32a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z M10 20h2 M15 20h2 M20 20h2 M25 20h2 M30 20h2 M35 20h3 M15 28h18',
  almacenamiento:
    'M14 6h20a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z M18 36h12 M24 14v8',
};

type ProductImageProps = {
  name: string;
  category: string;
  imageUrl: string | null;
  className?: string;
};

export function ProductImage({ name, category, imageUrl, className }: ProductImageProps) {
  return (
    <div
      className={cn(
        'grid aspect-square place-items-center overflow-hidden rounded-control border border-line bg-sunken',
        className,
      )}
    >
      {imageUrl ? (
        // En el paso de imágenes se cambia por <Image> de Next, servido desde S3 + CloudFront.
        // biome-ignore lint/performance/noImgElement: provisional hasta configurar next/image
        <img src={imageUrl} alt={name} className="size-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 48 48"
          className="w-1/2 fill-none stroke-ink stroke-[1.6]"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={name}
        >
          <path d={ICONS[category] ?? ICONS.almacenamiento} />
        </svg>
      )}
    </div>
  );
}
