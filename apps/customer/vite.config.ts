import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'VaiPizza',
        short_name: 'VaiPizza',
        description: 'Pedir pizza. Acompanhar em tempo real.',
        lang: 'pt-PT',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#080806',
        theme_color: '#E53935',
        prefer_related_applications: false,
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
