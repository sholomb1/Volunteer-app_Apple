/**
 * Capacitor-specific Vite build config. The web build (vite.config.ts) is
 * hosted at /rescue/ via Apache; Capacitor needs root-relative paths instead
 * because the WebView loads from file:// inside the APK.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-cap' },
});
