import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: { target: 'esnext', sourcemap: false },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'],
      manifest: {
        name: 'Jaldi Chalo - Book a Ride',
        short_name: 'Jaldi Chalo',
        description: 'Book bike, auto and cab rides instantly in Kolkata',
        theme_color: '#FF5F1F',
        background_color: '#FF5F1F',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        orientation: 'portrait',
        start_url: '/?source=pwa',
        scope: '/',
        id: 'jaldichalo-customer-pwa',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg',     sizes: 'any',     type: 'image/svg+xml', purpose: 'any' }
        ],
        screenshots: [
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', form_factor: 'narrow', label: 'Jaldi Chalo Customer App' }
        ],
        categories: ['travel', 'transportation'],
        prefer_related_applications: false
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api', expiration: { maxEntries: 50, maxAgeSeconds: 60 } }
          },
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'geocode-api', expiration: { maxEntries: 100, maxAgeSeconds: 3600 } }
          },
          {
            urlPattern: /^https:\/\/router\.project-osrm\.org\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'osrm-routing', expiration: { maxEntries: 50, maxAgeSeconds: 300 } }
          },
          {
            urlPattern: /^https:\/\/basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 300, maxAgeSeconds: 86400 } }
          }
        ]
      }
    })
  ]
})
