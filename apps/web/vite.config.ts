import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Ajay Jewellers', short_name: 'Ajay', description: 'Billing, stock and dairy for Ajay Jewellers',
        theme_color: '#0c0b09', background_color: '#0c0b09', display: 'standalone', start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }, { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }],
      },
      workbox: {
        // the app shell is precached; data lives in IndexedDB (see src/offline), so API calls are never cached here
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff}'],
        navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/uploads/'),           // product photos
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'product-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
        }],
      },
    }),
  ],
  resolve: { alias: { '@': at('./src'), '@ajay/shared': at('../../packages/shared/src/index.ts') } },   // shared types/permissions straight from source
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' } },
});
