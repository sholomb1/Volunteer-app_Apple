import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Custom SW (src/push-sw.ts) adds a push event listener on top of the
      // workbox-generated precache. Required for Web Push API delivery.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'push-sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: "Zeh L'Zeh Rescue",
        short_name: "Zeh L'Zeh",
        description: "Rescue food. Help families.",
        theme_color: '#0f766e',     // teal-700, matches hero gradient
        background_color: '#0a0f1a',// near-black for splash
        display: 'standalone',
        orientation: 'portrait',
        start_url: process.env.BUILD_TARGET === 'host' ? '/' : '/rescue/',
        scope:     process.env.BUILD_TARGET === 'host' ? '/' : '/rescue/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // Build targets:
  //   • default web → /rescue/  (served from staging.zehlzeh.org/rescue/)
  //   • cap (APK)   → ./        (Capacitor WebView, relative assets)
  //   • host        → /         (external static host: Firebase / Vercel / Netlify)
  base: process.env.BUILD_TARGET === 'cap'  ? './'
      : process.env.BUILD_TARGET === 'host' ? '/'
      : '/rescue/',
  server: { port: 5175, host: true },
});
