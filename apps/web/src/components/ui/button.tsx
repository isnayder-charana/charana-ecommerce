import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const variants = {
  /** Acción principal: "Comprar ahora" */
  primary: 'bg-action text-white hover:bg-action-hover',
  /** Acción secundaria: "Agregar al carrito" */
  secondary: 'bg-action-soft text-action hover:bg-action-soft/70',
  /** Acción de texto: "Ver todo" */
  link: 'text-action hover:underline px-0',
} as const;

const sizes = {
  md: 'h-11 px-5 text-sm',
  sm: 'h-9 px-3 text-sm',
  icon: 'size-8 text-base',
} as const;

type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

/** Las clases del botón, para usarlas también en enlaces que se ven como botón. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button type="button" className={buttonClasses({ variant, size, className })} {...props} />
  );
}
