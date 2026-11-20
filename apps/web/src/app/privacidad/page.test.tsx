import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from './page';

describe('Página de privacidad', () => {
  it('explica qué datos se guardan y cómo pedir que se borren', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'Política de privacidad' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Qué datos guardamos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abriendo un issue/ })).toHaveAttribute(
      'href',
      'https://github.com/isnayder-charana/charana-ecommerce/issues',
    );
  });
});
