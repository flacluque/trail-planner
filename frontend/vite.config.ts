import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `vite build --mode app` : la version embarquée dans l'appli iPhone (Capacitor), qui appelle le serveur en ligne
// (.env.app) et n'a pas besoin du service worker de la PWA (ses fichiers sont déjà dans l'appli).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // PWA : l'appli et le dernier plan consulté restent disponibles sans réseau (le jour J, en montagne).
    mode !== 'app' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Ravitime',
        short_name: 'Ravitime',
        description: 'Heures de passage, ravitos et barrières horaires de ta course',
        lang: 'fr',
        theme_color: '#1f4d3a',
        background_color: '#f6f4ef',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Dépendances optionnelles de jsPDF (export HTML), jamais chargées ici : inutile de les garder hors ligne.
        globIgnores: ['**/html2canvas*', '**/purify*'],
        // Polices gardées hors ligne : alphabet latin seulement (les autres jeux se chargent à la demande).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}', '**/*-latin-[0-9]*-normal*.woff2', '**/*-latin-ext-[0-9]*-normal*.woff2'],
        runtimeCaching: [
          {
            // Strava : jamais de cache (connexion, jetons, activités toujours à jour).
            // /api/app non plus : la configuration (code d'accès, comptes) doit être celle du serveur, pas une copie.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/strava/')
              && url.pathname !== '/api/app',
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5, expiration: { maxEntries: 50 } },
          },
          {
            // Seules les tuiles déjà affichées sont gardées : pas de préchargement (règles d'usage OSM).
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-osm',
              expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // En dev, l'API Spring tourne à côté (mvn spring-boot:run).
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    environment: 'node',
  },
}));
