import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'engine-tests/**/*.{test,spec}.ts',
      'store-tests/**/*.{test,spec}.ts',   // Phase 0.6: harvestStore + hooks coverage
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: [
        'src/engine/**',
        'src/utils/**',
        'src/store/**',   // Phase 0.6
        'src/hooks/**',   // Phase 0.6
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
