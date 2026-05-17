import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + self-registration: a new deploy surfaces an in-app
      // "Reload" toast instead of silently reloading mid-use.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Calorie Tracker',
        short_name: 'Calories',
        description: 'Personal calorie & nutrition tracker',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'world.openfoodfacts.org' ||
              url.hostname === 'images.openfoodfacts.org',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'off-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
          {
            // USDA FoodData Central search responses.
            urlPattern: ({ url }) => url.hostname === 'api.nal.usda.gov',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'usda-cache',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    // Vite 5 strictly checks the Host header. Allow Cloudflare quick
    // tunnels (`*.trycloudflare.com`) so `pnpm tunnel` works on a phone
    // without hand-editing this file per session, plus any *.workers.dev
    // for the eventual permanent deploy. Localhost / LAN IPs are
    // implicitly allowed.
    allowedHosts: [
      '.trycloudflare.com',
      '.workers.dev',
      '.pages.dev',
    ],
    proxy: {
      // Google Health API (health.googleapis.com) doesn't send CORS
      // headers, so the browser can't call it directly. In dev the Vite
      // server proxies /gh-api/* to it; in production the Cloudflare
      // Worker does the same. The client always uses the relative
      // /gh-api path so the code is environment-agnostic.
      '/gh-api': {
        target: 'https://health.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gh-api/, ''),
      },
    },
  },
});
