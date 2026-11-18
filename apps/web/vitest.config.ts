import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // El mismo alias que tsconfig.json: '@/lib/money' → src/lib/money
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // jsdom simula un navegador (document, window) dentro de Node para probar componentes.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/features/**', 'src/components/**'],
      exclude: [
        '**/*.test.*',
        // Solo corren dentro de Next (cookies, Server Actions): se prueban de punta a punta.
        'src/features/cart/cart.actions.ts',
        'src/features/cart/cart-cookie.ts',
        'src/features/cart/cart-view.ts',
        'src/features/cart/add-to-cart.tsx',
        'src/features/cart/cart-line-item.tsx',
        'src/components/layout/**',
        // Depende del viaje real a Google y de vuelta: se prueba en el navegador (ver docs/pasos/17).
        'src/features/auth/oauth-callback.tsx',
        'src/features/auth/test-helpers.tsx',
        'src/features/orders/test-utils.tsx',
        'src/features/orders/checkout.actions.ts',
        // Cambia de página (window.location): los tests la reemplazan.
        'src/lib/navigation.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
