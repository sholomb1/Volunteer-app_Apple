import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wrapper for the rescue PWA. One APK serves both roles — the role
 * routing happens inside the React app off the logged-in user's JWT.
 */
const config: CapacitorConfig = {
  appId: 'org.zehlzeh.volunteer',
  appName: "Zeh L'Zeh Rescue",
  webDir: 'dist-cap',
  android: {
    // Staging API is plain HTTP on :7200 until TLS is in front of it.
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      // Don't overlay the WebView under the status bar — the Android theme
      // insets the WebView already; this keeps the plugin consistent.
      overlaysWebView: false,
      backgroundColor: '#2C5A3B',
      style: 'DARK',
    },
    // Patch JS fetch + XMLHttpRequest to go through Android's native HTTP
    // client. Bypasses WebView-level interception (DNS / content filters that
    // only inspect chromium-WebView traffic) which was killing requests to
    // staging.zehlzeh.org for users with TAG/Gentech/JNet-style filters while
    // public hosts (cloudflare.com, 1.1.1.1) worked fine.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
