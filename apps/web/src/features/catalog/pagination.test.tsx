import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pagination } from './pagination';

describe('<Pagination>', () => {
  it('no se muestra si hay una sola página', () => {
    const { container } = render(<Pagination filters={{}} totalPages={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marca la página actual y enlaza anterior y siguiente', () => {
    render(<Pagination filters={{ category: 'cables', page: 2 }} totalPages={3} />);
    expect(screen.getByText('2')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '‹ Anterior' })).toHaveAttribute(
      'href',
      '/productos?categoria=cables',
    );
    expect(screen.getByRole('link', { name: 'Siguiente ›' })).toHaveAttribute(
      'href',
      '/productos?categoria=cables&pagina=3',
    );
  });
});
