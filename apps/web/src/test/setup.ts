// Agrega comparaciones para el DOM: expect(boton).toBeDisabled(), toHaveTextContent(), etc.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cada test empieza con la pantalla vacía y sin "mocks" de tests anteriores.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
