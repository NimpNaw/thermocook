/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png', 'favicon.svg', 'icons/*.png', 'sounds/*.wav'],
      manifest: {
        name: 'ThermoCook',
        short_name: 'ThermoCook',
        description: 'Ma cuisine Thermomix auto-hébergée',
        lang: 'fr',
        theme_color: '#006d5b',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: {
      usePolling: true
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Vitest ne doit pas tenter d'exécuter les specs Playwright (qui utilisent
    // `@playwright/test`, pas `vitest`).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: [
        'src/api.ts',
        'src/hooks/**/*.ts',
        'src/context/**/*.tsx',
        'src/components/**/*.tsx',
        'src/utils/**/*.ts',
        'src/pages/**/*.tsx',
        'src/store/**/*.ts',
        'src/constants/**/*.ts',
        'src/App.tsx',
      ],
      // Seuils appliqués en CI (npm run test:coverage) : niveau actuel ~77 %
      // stmts / 67 % branches — les seuils laissent une marge sans autoriser
      // de grosse régression.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 60,
        lines: 70,
      },
    },
  },
});
