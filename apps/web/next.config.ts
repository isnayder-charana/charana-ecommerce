import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // TypeScript 7 (nativo, en Go) todavía no expone la API que Next usa para revisar tipos
  // durante `next build`. Los tipos se revisan aparte con `pnpm typecheck` (tsc --noEmit),
  // igual que en apps/api.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
