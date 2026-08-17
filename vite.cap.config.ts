/**
 * Capacitor-specific Vite build config. The web build (vite.config.ts) is
 * hosted at /rescue/ via Apache; Capacitor needs root-relative paths instead
 * because the WebView loads from file:// inside the APK.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// abc867 (Aug 17): src/App.tsx references the build-time constants
// __APP_VERSION_CODE__ / __APP_VERSION_NAME__. vite.config.ts defines them,
// this Capacitor-only config used to omit them, so the iOS bundle shipped
// with the literal identifier and crashed on launch:
//     ReferenceError: Can't find variable: __APP_VERSION_CODE__
// Same gradle-driven single source of truth as the web build.
function readGradleVersion() {
  try {
    const src = fs.readFileSync(path.resolve('android/app/build.gradle'), 'utf8');
    const code = /versionCode\s+(\d+)/.exec(src)?.[1] ?? '0';
    const name = /versionName\s+"([^"]+)"/.exec(src)?.[1] ?? 'dev';
    return { code, name };
  } catch { return { code: '0', name: 'dev' }; }
}
const APP_VERSION = readGradleVersion();

export default defineConfig({
  define: {
    __APP_VERSION_CODE__: JSON.stringify(APP_VERSION.code),
    __APP_VERSION_NAME__: JSON.stringify(APP_VERSION.name),
  },
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-cap' },
});
