import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { aProduct } from '@/test/fixtures';
import { ProductCard } from './product-card';

describe('<ProductCard>', () => {
  it('enlaza a la ficha del producto y muestra sus datos', () => {
    const product = aProduct();
    render(<ProductCard product={product} />);

    expect(screen.getByRole('link', { name: product.name })).toHaveAttribute(
      'href',
      `/productos/${product.id}`,
    );
    expect(screen.getByText('Periféricos')).toBeInTheDocument();
    expect(screen.getByText('$ 89.99')).toBeInTheDocument();
    expect(screen.getByText('En stock')).toBeInTheDocument();
  });

  it('avisa cuando no hay stock', () => {
    render(<ProductCard product={aProduct({ stock: 0, inStock: false })} />);
    expect(screen.getByText('Sin stock')).toBeInTheDocument();
  });

  it('muestra la etiqueta de más vendido solo si se indica', () => {
    const { rerender } = render(<ProductCard product={aProduct()} />);
    expect(screen.queryByText('Más vendido')).not.toBeInTheDocument();
    rerender(<ProductCard product={aProduct()} bestseller />);
    expect(screen.getByText('Más vendido')).toBeInTheDocument();
  });

  it('usa la foto si el producto la tiene', () => {
    render(<ProductCard product={aProduct({ imageUrl: 'https://cdn.example.com/t.jpg' })} />);
    expect(screen.getByRole('img', { name: 'Teclado mecánico compacto' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/t.jpg',
    );
  });
});
