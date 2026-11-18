'use client';

import { cn } from '@/lib/cn';

/** Selector de cantidad: de 1 hasta el stock, con un máximo de 10 por compra. */
export function QuantitySelect({
  id = 'cantidad',
  value,
  onChange,
  stock,
  disabled = false,
  compact = false,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  stock: number;
  disabled?: boolean;
  /** En el carrito: sin el texto "Cantidad:" visible ni los disponibles. */
  compact?: boolean;
}) {
  // Si ya tiene más de lo que hay en stock (el stock bajó), igual mostramos su cantidad actual.
  const max = Math.max(Math.min(stock, 10), value);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <label htmlFor={id} className={cn(compact && 'sr-only')}>
        Cantidad:
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 rounded-control border border-line bg-surface px-2 font-semibold disabled:opacity-60"
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? 'unidad' : 'unidades'}
          </option>
        ))}
      </select>
      {!compact && <span className="whitespace-nowrap text-muted">({stock} disponibles)</span>}
    </div>
  );
}
