import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Price } from './price';

describe('<Price>', () => {
  it('muestra el precio formateado', () => {
    render(<Price priceCents={8999} currency="USD" />);
    expect(screen.getByText('$ 89.99')).toBeInTheDocument();
    expect(screen.queryByText(/OFF/)).not.toBeInTheDocument();
  });

  it('con precio anterior mayor muestra el tachado y el descuento', () => {
    render(<Price priceCents={3499} currency="USD" compareAtCents={4999} />);
    expect(screen.getByText('$ 49.99').tagName).toBe('S');
    expect(screen.getByText('30% OFF')).toBeInTheDocument();
  });

  it('ignora un precio anterior que no es mayor', () => {
    render(<Price priceCents={3499} currency="USD" compareAtCents={3000} />);
    expect(screen.queryByText(/OFF/)).not.toBeInTheDocument();
  });
});
