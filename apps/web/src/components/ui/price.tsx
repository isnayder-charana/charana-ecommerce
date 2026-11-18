import { discountPercent, formatMoney } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Badge } from './badge';

type PriceProps = {
  priceCents: number;
  currency: string;
  /** Precio anterior. Si existe y es mayor, se muestra tachado con el % OFF en verde. */
  compareAtCents?: number | null;
  size?: 'md' | 'lg';
};

export function Price({ priceCents, currency, compareAtCents, size = 'md' }: PriceProps) {
  const hasDeal = compareAtCents != null && compareAtCents > priceCents;

  return (
    <div className="flex flex-col">
      {hasDeal && <s className="text-xs text-muted">{formatMoney(compareAtCents, currency)}</s>}
      <div className="flex items-center gap-1.5">
        <span className={cn('font-bold tabular-nums', size === 'lg' ? 'text-3xl' : 'text-base')}>
          {formatMoney(priceCents, currency)}
        </span>
        {hasDeal && <Badge tone="deal">{discountPercent(priceCents, compareAtCents)}% OFF</Badge>}
      </div>
    </div>
  );
}
