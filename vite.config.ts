import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

// C12 Aug 13 — expose the APK versionCode + versionName as build-time
// constants. Read from android/app/build.gradle so bumping the Android
// version file is the single source of truth. Falls back to 0/dev when the
// gradle file isn't findable (e.g. running an isolated test build).
import fs from 'node:fs';
import path from 'node:path';
function readGradleVersion() {
  try {
    const src = fs.readFileSync(path.resolve('android/app/build.gradle'), 'utf8');
    const code = /versionCode\s+(\d+)/.exec(src)?.[1] ?? '0';
    const name = /versionName\s+"([^"]+)"/.exec(src)?.[1] ?? 'dev';
    return { code, name };
  } catch { return { code: '0', name: 'dev' }; }
}
const APP_VERSION = readGradleVersion();

// Oct 14 client: publish version.json (app version + build time) next to index.html,
// i.e. /rescue/version.json on the site. The phone app reads it from the live site to
// tell drivers when a newer app is in the store (src/app-version-check.ts).
function versionJson(): Plugin {
  return {
    name: 'zlz-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          versionCode: Number(APP_VERSION.code) || 0,
          versionName: APP_VERSION.name,
          builtAt: new Date().toISOString(),
        }, null, 2) + '\n',
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION_CODE__: JSON.stringify(APP_VERSION.code),
    __APP_VERSION_NAME__: JSON.stringify(APP_VERSION.name),
    // Oct 14 client: when this bundle was built (What's new shows unreleased items as live with this time on the live site).
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    versionJson(), // Oct 14 client
    VitePWA({
      // Oct 14 client: no service worker in the phone app build (BUILD_TARGET=cap):
      // the files are inside the app, and a SW there only risks serving stale files.
      disable: process.env.BUILD_TARGET === 'cap',
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
  // Oct 11 client: speed — React + router + react-query in their own long-lived
  // chunk (changes rarely, stays cached across app updates); leaflet only with
  // the map screens. Everything else: Rollup's default split per lazy screen.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@tanstack)[\\/]/.test(id)) return 'react-vendor';
          if (/[\\/]node_modules[\\/]leaflet[\\/]/.test(id)) return 'leaflet';
          return undefined;
        },
      },
    },
  },
});
