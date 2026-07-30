/**
 * Native (Capacitor / Android) push registration via FCM. Call
 * ensureNativePushRegistered() after auth — it requests notification
 * permission, registers the device with FCM, and posts the token to
 * /me/device so the server (firebase-admin) can deliver pushes here.
 *
 * IMPORTANT: PushNotifications is imported STATICALLY (like @capacitor/
 * geolocation, which works). A dynamic import() splits it into a separate
 * chunk that the Capacitor WebView often fails to load, so the plugin never
 * registers and requestPermissions() never fires — no prompt, no token.
 *
 * No-op outside the Capacitor native shell — browsers use web-push-client.ts.
 * Safe to call repeatedly: listeners bind once; the server upserts by token.
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';

const APP_VERSION = '1.0.17';
let listenersBound = false;

async function postToken(platform: 'android' | 'ios', token: string) {
  await api('/api/me/device', {
    method: 'POST',
    body: JSON.stringify({ platform, pushToken: token, appVersion: APP_VERSION }),
  });
}

export async function ensureNativePushRegistered(): Promise<{ ok: boolean; reason?: string }> {
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() !== true) return { ok: false, reason: 'not-native' };
  const platform: 'android' | 'ios' = cap?.getPlatform?.() === 'ios' ? 'ios' : 'android';

  // Only prompt when undecided — don't nag on every open.
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return { ok: false, reason: `permission-${perm.receive}` };

  // Bind token listeners once — initial token + any FCM refresh flow through here.
  if (!listenersBound) {
    listenersBound = true;
    await PushNotifications.addListener('registration', (token) => {
      void postToken(platform, token.value).catch(() => {/* best-effort */});
    });
    await PushNotifications.addListener('registrationError', () => {/* best-effort */});
  }

  await PushNotifications.register();
  return { ok: true };
}
