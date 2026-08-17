/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

// C12 Aug 13 — vite.config define()s these from android/app/build.gradle.
declare const __APP_VERSION_CODE__: string;
declare const __APP_VERSION_NAME__: string;
