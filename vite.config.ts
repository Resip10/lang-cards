import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Карточки',
        short_name: 'Карточки',
        description: 'Личные языковые карточки с интервальным повторением',
        lang: 'ru',
        theme_color: '#1d3fa3',
        background_color: '#f6f8fc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cards are never precached: they are fetched fresh, with the cache as offline fallback.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['decks/**'],
        navigateFallbackDenylist: [/^\/decks\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/decks/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'decks',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 2000 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
});
